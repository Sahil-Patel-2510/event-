require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = express();
const PORT = process.env.PORT || 5000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

let mongoServer;
const otpChallenges = new Map();

const mailTransport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    })
  : null;

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  interest: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const enquirySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  eventType: { type: String, required: true },
  guestCount: { type: Number, required: true, min: 1, max: 200 },
  package: { type: String, required: true },
  cateringRequired: { type: String, enum: ['Yes', 'No'], required: true },
  cuisine: { type: [String], default: [] },
  otherFood: { type: String, default: '' },
  budget: { type: String, required: true },
  address: { type: String, required: true },
  confirmAddress: { type: String, required: true },
  otpVerifiedAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Enquiry = mongoose.model('Enquiry', enquirySchema);

async function connectDB() {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('MongoDB connected successfully using MONGODB_URI');
      return;
    }

    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully using in-memory MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    console.log('Add a real MONGODB_URI in a .env file to store data in your MongoDB account.');
    process.exit(1);
  }
}

app.get('/api/health', (req, res) => {
  const hasProvider = Boolean(
    (process.env.OTP_API_URL && process.env.OTP_API_KEY) ||
    (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) ||
    (mailTransport && process.env.SMTP_FROM)
  );
  res.json({
    status: 'ok',
    message: 'Event Plus API is running',
    otpMode: hasProvider ? 'provider' : (process.env.NODE_ENV === 'production' ? 'unconfigured' : 'development')
  });
});

async function sendSms(phone, message) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  const formattedPhone = normalizedPhone.length === 10 ? `91${normalizedPhone}` : normalizedPhone;

  if (process.env.FAST2SMS_API_KEY) {
    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        authorization: process.env.FAST2SMS_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        route: process.env.FAST2SMS_ROUTE || 'otp',
        sender_id: process.env.FAST2SMS_SENDER_ID || 'FSTSMS',
        message,
        numbers: formattedPhone,
        flash: 0,
        language: 'english'
      })
    });

    const responseBody = await response.text();
    let payload = {};
    if (responseBody) {
      try { payload = JSON.parse(responseBody); } catch { payload = { message: responseBody }; }
    }

    if (!response.ok || (payload && payload.return === false) || (payload && payload.status && payload.status === 'error')) {
      throw new Error(payload.message || 'Fast2SMS rejected the OTP request');
    }
    return true;
  }

  if (process.env.OTP_API_URL && process.env.OTP_API_KEY) {
    const response = await fetch(process.env.OTP_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OTP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to: phone, message })
    });

    if (!response.ok) throw new Error('OTP provider rejected the request');
    return true;
  }

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM) {
    return false;
  }

  const credentials = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: process.env.TWILIO_FROM, To: phone, Body: message })
  });

  if (!response.ok) throw new Error('SMS provider rejected the OTP request');
  return true;
}

async function sendEmail(email, code) {
  if (!mailTransport || !process.env.SMTP_FROM) return false;
  await mailTransport.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Your Event Plus verification code',
    text: `Your Event Plus OTP is ${code}. It expires in 10 minutes. Do not share this code.`
  });
  return true;
}

app.post('/api/send-otp', async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email || !phone) return res.status(400).json({ message: 'Email and mobile number are required' });

    const emailConfigured = Boolean(mailTransport && process.env.SMTP_FROM);
    const smsConfigured = Boolean(
      process.env.FAST2SMS_API_KEY ||
      (process.env.OTP_API_URL && process.env.OTP_API_KEY) ||
      (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM)
    );
    const developmentOtpEnabled = process.env.NODE_ENV !== 'production' && process.env.OTP_DEV_MODE !== 'false';
    if (!emailConfigured && !smsConfigured && !developmentOtpEnabled) {
      return res.status(503).json({ message: 'OTP service is not configured. Add SMTP or Twilio settings in .env.' });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const challengeId = crypto.randomUUID();
    const deliveries = [];
    const deliveryChannels = [];
    if (emailConfigured) {
      deliveries.push(sendEmail(email, code));
      deliveryChannels.push('email');
    }
    if (smsConfigured) {
      deliveries.push(sendSms(phone, `Event Plus verification code: ${code}. Expires in 10 minutes.`));
      deliveryChannels.push('mobile');
    }
    await Promise.all(deliveries);

    otpChallenges.set(challengeId, { email, phone, code, expiresAt: Date.now() + 10 * 60 * 1000 });
    setTimeout(() => otpChallenges.delete(challengeId), 10 * 60 * 1000);
    const response = {
      message: developmentOtpEnabled && deliveryChannels.length === 0
        ? 'Development OTP generated. Use the code shown below.'
        : `OTP sent to your ${deliveryChannels.join(' and ')}.`,
      challengeId
    };
    if (developmentOtpEnabled && deliveryChannels.length === 0) response.developmentCode = code;
    res.json(response);
  } catch (error) {
    res.status(502).json({ message: 'Could not send OTP. Check your email/SMS provider settings.' });
  }
});

app.post('/api/verify-otp', (req, res) => {
  const { challengeId, code, email, phone } = req.body;
  const challenge = otpChallenges.get(challengeId);
  if (!challenge || challenge.expiresAt < Date.now()) {
    return res.status(400).json({ message: 'OTP expired. Please request a new code.' });
  }
  if (challenge.email !== email || challenge.phone !== phone || challenge.code !== String(code)) {
    return res.status(400).json({ message: 'Invalid OTP. Please check the code and try again.' });
  }

  const verificationToken = crypto.randomUUID();
  challenge.verificationToken = verificationToken;
  otpChallenges.set(challengeId, challenge);
  res.json({ message: 'Contact details verified successfully', verificationToken });
});

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, password, interest } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'All required fields must be filled' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      interest: interest || ''
    });

    await user.save();

    res.status(201).json({ message: 'Registration successful', user: { name, email, phone, interest } });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({
      message: 'Login successful',
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        interest: user.interest
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

app.post('/api/enquiry', async (req, res) => {
  try {
    const raw = req.body || {};
    const name = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim() : raw.name;
    const email = typeof raw.email === 'string' ? raw.email.trim() : raw.email;
    const phone = typeof raw.phone === 'string' ? raw.phone.trim() : raw.phone;
    const eventType = typeof raw.eventType === 'string' ? raw.eventType.replace(/\s+/g, ' ').trim() : raw.eventType;
    const eventPackage = typeof raw.package === 'string' ? raw.package.replace(/\s+/g, ' ').trim() : raw.package;
    const cateringRequired = typeof raw.cateringRequired === 'string' ? raw.cateringRequired.trim() : raw.cateringRequired;
    const cuisine = Array.isArray(raw.cuisine) ? raw.cuisine.map((item) => String(item).trim()).filter(Boolean) : (typeof raw.cuisine === 'string' ? [raw.cuisine.trim()].filter(Boolean) : []);
    const otherFood = typeof raw.otherFood === 'string' ? raw.otherFood.replace(/\s+/g, ' ').trim() : raw.otherFood || '';
    const budget = typeof raw.budget === 'string' ? raw.budget.replace(/\s+/g, ' ').trim() : raw.budget;
    const address = typeof raw.address === 'string' ? raw.address.replace(/\s+/g, ' ').trim() : raw.address;
    const confirmAddress = typeof raw.confirmAddress === 'string' ? raw.confirmAddress.replace(/\s+/g, ' ').trim() : raw.confirmAddress;
    const guestCount = raw.guestCount;

    if (!name || !email || !phone || !eventType || !guestCount || !eventPackage || !cateringRequired || !budget || !address || !confirmAddress) {
      return res.status(400).json({ message: 'Please complete all required event details' });
    }

    if (address.toLowerCase() !== confirmAddress.toLowerCase()) {
      return res.status(400).json({ message: 'Address and confirm address must match' });
    }

    const guestTotal = Number(String(guestCount).trim());
    if (!Number.isInteger(guestTotal) || guestTotal < 1 || guestTotal > 200) {
      return res.status(400).json({ message: 'Guest count must be between 1 and 200' });
    }

    if (cateringRequired === 'Yes' && cuisine.length === 0) {
      return res.status(400).json({ message: 'Please select at least one food menu option' });
    }

    const enquiry = new Enquiry({
      name, email, phone, eventType, guestCount: guestTotal, package: eventPackage,
      cateringRequired, cuisine: cateringRequired === 'Yes' ? cuisine : [], otherFood, budget, address, confirmAddress,
      otpVerifiedAt: new Date()
    });
    await enquiry.save();

    res.status(201).json({
      message: 'Your event interest has been submitted successfully. Our team will contact you in 2-3 hours.'
    });
  } catch (error) {
    res.status(500).json({ message: 'Enquiry submission failed', error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch(() => {
    process.exit(1);
  });
