import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Serve frontend static files (the public/ folder mirrors the site root)
app.use(express.static(join(__dirname, 'public')));

// ── CLIENTS ──
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const SALON_ADDRESS = 'Rua Arco do Marquês de Alegrete, loja 4 D, 1100-034 Lisboa';
const SALON_NAME = 'Barsha Beauty Salon';

// ── HEALTH CHECK ──
app.get('/api/health', async (_req, res) => {
  try {
    const { error } = await supabase.from('bookings').select('id').limit(1);
    if (error) throw error;
    res.json({ ok: true, db: 'connected' });
  } catch (e) {
    res.status(500).json({ ok: false, db: e.message });
  }
});

// ── GET /api/slots ── returns taken time slots for a given date
app.get('/api/slots', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });
  try {
    const { data, error } = await supabase
      .from('blocked_slots')
      .select('time')
      .eq('date', date);
    if (error) throw error;
    res.json({ taken: (data || []).map(r => r.time) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/create-payment-intent ──
app.post('/api/create-payment-intent', async (req, res) => {
  const { amount, name, email, service, duration, date, time } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount is required' });
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // euros → cents
      currency: 'eur',
      description: `${SALON_NAME} — ${name || 'Guest'} — ${service || ''} ${duration ? duration + 'min' : ''} — ${date || ''} ${time || ''}`,
      receipt_email: email || undefined,
      automatic_payment_methods: { enabled: true },
      metadata: {
        customer_name: name || '',
        customer_email: email || '',
        service: service || '',
        duration_min: String(duration || ''),
        date: date || '',
        time: time || ''
      }
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/book ──
app.post('/api/book', async (req, res) => {
  const { service, duration, price, date, time, name, email, phone, notes, paymentIntentId } = req.body;

  const required = { service, price, date, time, name, email, phone };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  const ref = 'BBS-' + Math.floor(100000 + Math.random() * 900000);

  try {
    const { error: insertErr } = await supabase.from('bookings').insert({
      ref, service, duration: duration || 0, price, date, time, name, email, phone,
      notes: notes || null, payment_intent_id: paymentIntentId || null,
      pay_method: paymentIntentId ? 'card' : 'unknown', status: 'confirmed'
    });
    if (insertErr) throw insertErr;

    await supabase.from('blocked_slots').upsert({ date, time }, { onConflict: 'date,time' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  await sendConfirmationEmail({ ref, name, email, service, duration, date, time, price });

  res.json({ success: true, ref });
});

// ── EMAIL CONFIRMATION (Resend) ──
async function sendConfirmationEmail({ ref, name, email, service, duration, date, time, price }) {
  if (!resend) return; // not configured — skip silently
  const firstName = String(name).split(' ')[0];
  try {
    await resend.emails.send({
      from: `${SALON_NAME} <${process.env.EMAIL_FROM || 'reservas@barshabeautysalon.pt'}>`,
      to: email,
      subject: `Reserva confirmada — ${ref} | ${SALON_NAME}`,
      html: buildEmailHtml({ ref, firstName, service, duration, date, time, price })
    });
  } catch (err) {
    console.error('Email error:', err.message);
  }
}

function buildEmailHtml({ ref, firstName, service, duration, date, time, price }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#FAF9F6;font-family:Georgia,serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border:1px solid #E8E0D0;border-radius:8px;overflow:hidden;">
    <div style="background:#0A0A0A;padding:32px 40px;">
      <p style="margin:0;color:#C9A24C;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">${SALON_NAME}</p>
      <h1 style="margin:8px 0 0;color:#FAF9F6;font-weight:400;font-size:26px;">Reserva Confirmada</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#444;font-size:15px;line-height:1.7;">Olá ${firstName},</p>
      <p style="color:#444;font-size:15px;line-height:1.7;">A sua sessão foi reservada com sucesso. Até breve!</p>
      <div style="background:#FAF9F6;border:1px solid #E8E0D0;border-radius:6px;padding:20px 24px;margin:24px 0;">
        <p style="margin:0 0 4px;font-size:10px;color:#999;letter-spacing:0.15em;text-transform:uppercase;">Referência</p>
        <p style="margin:0 0 16px;font-size:18px;color:#0A0A0A;font-weight:600;letter-spacing:0.08em;">${ref}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;border-bottom:1px solid #E8E0D0;color:#888;width:40%">Serviço</td><td style="padding:6px 0;border-bottom:1px solid #E8E0D0;color:#222;">${service}${duration ? ' — ' + duration + ' min' : ''}</td></tr>
          <tr><td style="padding:6px 0;border-bottom:1px solid #E8E0D0;color:#888;">Data</td><td style="padding:6px 0;border-bottom:1px solid #E8E0D0;color:#222;">${date}</td></tr>
          <tr><td style="padding:6px 0;border-bottom:1px solid #E8E0D0;color:#888;">Hora</td><td style="padding:6px 0;border-bottom:1px solid #E8E0D0;color:#222;">${time}</td></tr>
          <tr><td style="padding:6px 0;color:#888;">Total</td><td style="padding:6px 0;color:#0A0A0A;font-weight:600;">€${price}</td></tr>
        </table>
      </div>
      <p style="color:#666;font-size:13px;line-height:1.7;">⏰ Por favor chegue 5 minutos antes da sua sessão.<br>📍 ${SALON_ADDRESS}</p>
    </div>
    <div style="background:#FAF9F6;padding:20px 40px;border-top:1px solid #E8E0D0;">
      <p style="margin:0;font-size:12px;color:#999;">© ${SALON_NAME}</p>
    </div>
  </div>
</body></html>`;
}

// ── POST /api/contact ──
app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Missing fields' });
  if (!resend) return res.status(503).json({ error: 'Email not configured' });
  try {
    await resend.emails.send({
      from: `${SALON_NAME} <${process.env.EMAIL_FROM || 'reservas@barshabeautysalon.pt'}>`,
      to: process.env.OWNER_EMAIL || process.env.EMAIL_FROM,
      reply_to: email,
      subject: `Contacto: ${subject || 'Nova mensagem'} — ${name}`,
      html: `<p><strong>De:</strong> ${name} (${email})</p><p><strong>Assunto:</strong> ${subject || '—'}</p><p><strong>Mensagem:</strong><br>${String(message).replace(/\n/g, '<br>')}</p>`
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Contact email error:', err.message);
    res.status(500).json({ error: 'Failed to send' });
  }
});

// ── ADMIN MIDDLEWARE ──
function adminAuth(req, res, next) {
  const pw = req.headers['x-admin-password'];
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── GET /api/admin/bookings ──
app.get('/api/admin/bookings', adminAuth, async (req, res) => {
  const { status, from, to } = req.query;
  try {
    let query = supabase.from('bookings').select('*').order('date', { ascending: false }).order('time', { ascending: false });
    if (status) query = query.eq('status', status);
    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/stats ──
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('bookings').select('status, price, date');
    if (error) throw error;
    const today = new Date().toISOString().split('T')[0];
    const stats = {
      total: data.length,
      confirmed: data.filter(b => b.status === 'confirmed').length,
      pending: data.filter(b => b.status === 'pending').length,
      revenue: data.filter(b => b.status === 'confirmed').reduce((sum, b) => sum + Number(b.price), 0),
      today: data.filter(b => b.date === today).length
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/bookings/:ref ──
app.patch('/api/admin/bookings/:ref', adminAuth, async (req, res) => {
  const { status } = req.body;
  if (!['confirmed', 'pending', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings').select('date, time').eq('ref', req.params.ref).single();
    if (fetchErr) throw fetchErr;

    const { error } = await supabase.from('bookings').update({ status }).eq('ref', req.params.ref);
    if (error) throw error;

    // Cancelling frees up the slot so it can be booked again
    if (status === 'cancelled' && booking) {
      await supabase.from('blocked_slots').delete().eq('date', booking.date).eq('time', booking.time);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/bookings ── (manual / walk-in / phone bookings)
app.post('/api/admin/bookings', adminAuth, async (req, res) => {
  const { service, duration, price, date, time, name, email, phone, notes, pay_method, status } = req.body;
  const required = { service, price, date, time, name, email, phone };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return res.status(400).json({ error: `Missing: ${missing.join(', ')}` });

  const ref = 'BBS-' + Math.floor(100000 + Math.random() * 900000);
  try {
    const { error } = await supabase.from('bookings').insert({
      ref, service, duration: duration || 0, price, date, time, name, email, phone,
      notes: notes || null, pay_method: pay_method || 'cash', status: status || 'confirmed'
    });
    if (error) throw error;
    await supabase.from('blocked_slots').upsert({ date, time }, { onConflict: 'date,time' });
    res.json({ success: true, ref });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Barsha Beauty Salon API running on port ${PORT}`));
