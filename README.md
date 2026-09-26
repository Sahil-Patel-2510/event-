# Event Plus

A simple Event Plus website with login, registration, and event enquiry forms. The data is stored in MongoDB.

## Setup

1. Install dependencies:
   npm install

2. Start the server:
   npm start

3. Open the app:
   http://localhost:5000

The app uses the persistent MongoDB database `eventplus`. Make sure the MongoDB service is running before starting the server.

For local MongoDB, `.env` should contain:
   MONGODB_URI=mongodb://127.0.0.1:27017/eventplus

For MongoDB Atlas, replace it with your Atlas connection string. Do not use the Atlas browser URL:
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/eventplus

## OTP setup

Orders require OTP verification on the submitted email and mobile number. Add an SMTP account and either the provider API settings or Twilio settings to `.env` before using order confirmation:

   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-smtp-user
   SMTP_PASSWORD=your-smtp-password
   SMTP_FROM=Event Plus <no-reply@example.com>
   OTP_API_URL=https://your-otp-provider.example/send
   OTP_API_KEY=your-server-side-api-key
   TWILIO_ACCOUNT_SID=your-account-sid
   TWILIO_AUTH_TOKEN=your-auth-token
   TWILIO_FROM=+10000000000

The OTP expires after 10 minutes. An order cannot be stored in MongoDB until the email/mobile OTP is verified.

For local development only, OTP fallback is enabled unless `OTP_DEV_MODE=false`; it generates an OTP without sending a message and shows the code in the order form. Never use this fallback in production. Set `NODE_ENV=production`, `OTP_DEV_MODE=false`, and configure a real provider before deployment.

The provider API receives a JSON body with `to` and `message`, and the key is sent as `Authorization: Bearer <OTP_API_KEY>`. Keep both values in `.env`; never put the API key in browser JavaScript or HTML. If the provider uses a different request format, its adapter must be adjusted in `sendSms` in `server.js`.

## API endpoints

- POST /api/register
- POST /api/login
- POST /api/enquiry
- GET /api/health
