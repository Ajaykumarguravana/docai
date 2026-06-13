require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { Pool }   = require('pg');
const { GoogleGenAI } = require('@google/genai');
const nodemailer = require('nodemailer');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'docai_secret';

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Neon DB Pool ─────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ─── Nodemailer SMTP Transporter ──────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  pool: true,
  maxConnections: 5,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Send OTP Helper function
async function sendOTPEmail(email, otp, purpose) {
  const isRegister = purpose === 'register';
  const subject = isRegister ? 'Verify your email address - DocAI' : 'Reset your password - DocAI';
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #3b82f6; text-align: center;">DocAI Security Verification</h2>
      <p>Hello,</p>
      <p>Thank you for using DocAI. Please use the following One-Time Password (OTP) to complete your ${isRegister ? 'registration' : 'password reset'}:</p>
      <div style="background-color: #f3f4f6; padding: 15px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #1f2937; border-radius: 6px; margin: 20px 0;">
        ${otp}
      </div>
      <p style="color: #6b7280; font-size: 14px;">This OTP is valid for 10 minutes. Please do not share this code with anyone.</p>
      <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #9ca3af; text-align: center;">This is an automated email from DocAI. Please do not reply.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"${process.env.BREVO_SENDER_NAME || 'DocAI'}" <${process.env.BREVO_SENDER_EMAIL}>`,
    to: email,
    subject: subject,
    html: htmlContent,
  });
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
}


// ─── Init Tables (docai_ prefix — won't touch existing tables) ────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS docai_users (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS docai_documents (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES docai_users(id) ON DELETE CASCADE,
      filename   TEXT NOT NULL,
      doc_type   TEXT,
      word_count INTEGER DEFAULT 0,
      analysis   JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS docai_otps (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL,
      otp        TEXT NOT NULL,
      purpose    TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ DocAI tables ready (docai_users, docai_documents, docai_otps)');
}

// ─── Gemini AI ────────────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Authentication required.' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function authOptional(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try { req.user = jwt.verify(header.split(' ')[1], JWT_SECRET); } catch {}
  }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/auth/send-otp
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ error: 'Email is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Please enter a valid email address.' });

    const existing = await pool.query('SELECT id FROM docai_users WHERE email=$1', [email.toLowerCase()]);
    if (existing.rows.length)
      return res.status(409).json({ error: 'An account with this email already exists.' });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    // Clean up previous registration OTPs for this email
    await pool.query('DELETE FROM docai_otps WHERE email=$1 AND purpose=$2', [email.toLowerCase(), 'register']);

    // Save to DB
    await pool.query(
      'INSERT INTO docai_otps (email, otp, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [email.toLowerCase(), otp, 'register', expiresAt]
    );

    // Send email
    await sendOTPEmail(email.toLowerCase(), otp, 'register');

    res.json({ success: true, message: 'Verification OTP sent to your email.' });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Failed to send verification email. Please check your credentials.' });
  }
});

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, otp } = req.body;
    if (!name || !email || !password || !otp)
      return res.status(400).json({ error: 'All fields (name, email, password, OTP) are required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (!/[A-Z]/.test(password))
      return res.status(400).json({ error: 'Password must contain at least one capital letter.' });
    if (!/[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;\'\/]/.test(password))
      return res.status(400).json({ error: 'Password must contain at least one special character (e.g. @, #, !).' });

    // Verify OTP
    const otpRes = await pool.query(
      'SELECT id FROM docai_otps WHERE email=$1 AND otp=$2 AND purpose=$3 AND expires_at > NOW()',
      [email.toLowerCase(), otp.trim(), 'register']
    );
    if (!otpRes.rows.length) {
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }

    // Double check user doesn't exist
    const existing = await pool.query('SELECT id FROM docai_users WHERE email=$1', [email.toLowerCase()]);
    if (existing.rows.length)
      return res.status(409).json({ error: 'An account with this email already exists.' });

    // Delete the used OTP
    await pool.query('DELETE FROM docai_otps WHERE email=$1 AND purpose=$2', [email.toLowerCase(), 'register']);

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO docai_users (name, email, password) VALUES ($1,$2,$3) RETURNING id, name, email, created_at',
      [name.trim(), email.toLowerCase(), hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, created_at: user.created_at } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/send-reset-otp
app.post('/api/auth/send-reset-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ error: 'Email is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Please enter a valid email address.' });

    const existing = await pool.query('SELECT id FROM docai_users WHERE email=$1', [email.toLowerCase()]);
    if (!existing.rows.length)
      return res.status(404).json({ error: 'No account found with this email address.' });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    // Clean up previous reset OTPs for this email
    await pool.query('DELETE FROM docai_otps WHERE email=$1 AND purpose=$2', [email.toLowerCase(), 'reset_password']);

    // Save to DB
    await pool.query(
      'INSERT INTO docai_otps (email, otp, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [email.toLowerCase(), otp, 'reset_password', expiresAt]
    );

    // Send email
    await sendOTPEmail(email.toLowerCase(), otp, 'reset_password');

    res.json({ success: true, message: 'Password reset code sent to your email.' });
  } catch (err) {
    console.error('Send reset OTP error:', err);
    res.status(500).json({ error: 'Failed to send password reset email.' });
  }
});

// POST /api/auth/reset-password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, otp, password } = req.body;
    if (!email || !otp || !password)
      return res.status(400).json({ error: 'Email, verification code, and new password are required.' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (!/[A-Z]/.test(password))
      return res.status(400).json({ error: 'Password must contain at least one capital letter.' });
    if (!/[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;\'\/]/.test(password))
      return res.status(400).json({ error: 'Password must contain at least one special character (e.g. @, #, !).' });

    // Verify OTP
    const otpRes = await pool.query(
      'SELECT id FROM docai_otps WHERE email=$1 AND otp=$2 AND purpose=$3 AND expires_at > NOW()',
      [email.toLowerCase(), otp.trim(), 'reset_password']
    );
    if (!otpRes.rows.length) {
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }

    // Delete the used OTP
    await pool.query('DELETE FROM docai_otps WHERE email=$1 AND purpose=$2', [email.toLowerCase(), 'reset_password']);

    const hash = await bcrypt.hash(password, 12);
    const updateRes = await pool.query(
      'UPDATE docai_users SET password=$1 WHERE email=$2 RETURNING id',
      [hash, email.toLowerCase()]
    );

    if (!updateRes.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Please enter a valid email address.' });

    const result = await pool.query('SELECT * FROM docai_users WHERE email=$1', [email.toLowerCase()]);
    if (!result.rows.length)
      return res.status(401).json({ error: 'Invalid email or password.' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, created_at: user.created_at } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, created_at FROM docai_users WHERE id=$1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// PUT /api/auth/profile - Change Name
app.put('/api/auth/profile', authRequired, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required.' });
    }
    
    const result = await pool.query(
      'UPDATE docai_users SET name=$1 WHERE id=$2 RETURNING id, name, email, created_at',
      [name.trim(), req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }
    
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile name.' });
  }
});

// PUT /api/auth/password - Change Password
app.put('/api/auth/password', authRequired, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    // Get current hash
    const userRes = await pool.query('SELECT password FROM docai_users WHERE id=$1', [req.user.id]);
    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = userRes.rows[0];
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect current password.' });
    }

    // Validate new password rules
    if (newPassword.length < 8)
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    if (!/[A-Z]/.test(newPassword))
      return res.status(400).json({ error: 'New password must contain at least one capital letter.' });
    if (!/[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;\'\/]/.test(newPassword))
      return res.status(400).json({ error: 'New password must contain at least one special character (e.g. @, #, !).' });

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE docai_users SET password=$1 WHERE id=$2', [hash, req.user.id]);

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password. Please try again.' });
  }
});

// DELETE /api/auth/account - Delete Account Permanently
app.delete('/api/auth/account', authRequired, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required to confirm account deletion.' });
    }

    // Verify password
    const userRes = await pool.query('SELECT password FROM docai_users WHERE id=$1', [req.user.id]);
    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = userRes.rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect password. Account deletion canceled.' });
    }

    // Delete user (cascade will handle documents)
    await pool.query('DELETE FROM docai_users WHERE id=$1', [req.user.id]);

    res.json({ success: true, message: 'Account permanently deleted.' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account. Please try again.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYZE
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/analyze', authOptional, async (req, res) => {
  try {
    const { text, filename = 'document', model = 'gemini-2.5-flash' } = req.body;

    if (!text || text.trim().length < 50)
      return res.status(400).json({ error: 'Document text is too short or empty.' });

    const truncated    = text.slice(0, 2000000);
    const wasTruncated = text.length > 2000000;
    const wordCount    = text.trim().split(/\s+/).length;

    const prompt = `
You are an expert document analyst. Analyze the following document and respond with a JSON object ONLY (no markdown, no extra text) in this exact structure:

{
  "docType": "Legal Contract | Financial Report | Research Paper | General Document",
  "summary": "A clear, concise plain-language summary of the entire document (typically 4-6 sentences).",
  "keyFindings": [
    "Finding 1 (be specific and factual)",
    "Finding 2",
    "Finding 3",
    "Finding 4",
    "Finding 5"
  ],
  "riskFlags": [
    { "flag": "Short description of the risk", "severity": "High | Medium | Low", "detail": "1-2 sentence explanation" }
  ],
  "entities": {
    "parties": ["List of people/organizations/companies mentioned"],
    "dates": ["Important dates or deadlines"],
    "amounts": ["Monetary values, figures, percentages"],
    "locations": ["Locations or jurisdictions mentioned"]
  }
}

${wasTruncated ? 'NOTE: The document was extremely large; only the first 2,000,000 characters were analyzed.' : ''}
Document filename: ${filename}

--- DOCUMENT START ---
${truncated}
--- DOCUMENT END ---

Respond with JSON only.`;

    const response = await ai.models.generateContent({ model, contents: prompt });
    const rawText  = response.text.trim();
    const jsonStr  = rawText.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();

    let analysis;
    try   { analysis = JSON.parse(jsonStr); }
    catch { analysis = { docType:'Unknown', summary: rawText, keyFindings:[], riskFlags:[], entities:{parties:[],dates:[],amounts:[],locations:[]} }; }
    analysis.truncated = wasTruncated;

    // Save to history if user is logged in
    let historyId = null;
    if (req.user) {
      const saved = await pool.query(
        'INSERT INTO docai_documents (user_id, filename, doc_type, word_count, analysis) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [req.user.id, filename, analysis.docType || 'Unknown', wordCount, JSON.stringify(analysis)]
      );
      historyId = saved.rows[0].id;
    }

    res.json({ ...analysis, historyId });
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message || 'Failed to analyze document.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/chat', authOptional, async (req, res) => {
  try {
    const { message, docText = '', history = [], model = 'gemini-2.5-flash' } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required.' });

    const truncatedDoc = docText.slice(0, 25000);
    const contents = [
      { role:'user',  parts:[{ text:`You are a helpful document analysis assistant. Answer questions about the document concisely and accurately.\n\n--- DOCUMENT ---\n${truncatedDoc}\n--- END ---` }] },
      { role:'model', parts:[{ text:'Understood. I have read the document and am ready to answer your questions.' }] },
      ...history.map(h => ({ role: h.role === 'ai' ? 'model' : h.role, parts:[{ text: h.text }] })),
      { role:'user',  parts:[{ text: message }] },
    ];

    const response = await ai.models.generateContent({ model, contents });
    res.json({ reply: response.text });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message || 'Failed to get response.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/history — list all docs for logged-in user
app.get('/api/history', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, filename, doc_type, word_count, created_at
       FROM docai_documents WHERE user_id=$1
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ documents: result.rows });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Failed to fetch history.' });
  }
});

// GET /api/history/:id — get full analysis of one doc
app.get('/api/history/:id', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM docai_documents WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found.' });
    res.json({ document: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch document.' });
  }
});

// DELETE /api/history/:id
app.delete('/api/history/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM docai_documents WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete document.' });
  }
});

// ─── Catch-all ────────────────────────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── Start ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`\n🚀 DocAI server running at http://localhost:${PORT}\n`));
}).catch(err => {
  console.error('❌ DB init failed:', err.message);
  process.exit(1);
});
