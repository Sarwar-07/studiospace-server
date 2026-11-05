import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// CORS configuration allowing credentials for HTTPOnly cookies
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://studiospace-client.vercel.app'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// MongoDB Client Initialization
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db, studiosCollection, bookingsCollection;

async function connectDB() {
  try {
    await client.connect();
    db = client.db(process.env.DB_NAME || 'studiospace_db');
    studiosCollection = db.collection('studios');
    bookingsCollection = db.collection('bookings');
    
    await client.db('admin').command({ ping: 1 });
    console.log(`Connected to MongoDB Atlas: database "${process.env.DB_NAME}" is ready!`);
  } catch (error) {
    console.error('MongoDB connection failure:', error);
  }
}

connectDB();

// --- CHALLENGE 1: JWT & HTTPONLY COOKIE MIDDLEWARE ---

// Middleware: Verify Token from HTTPOnly Cookies
export const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access: No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized access: Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

// Generate JWT and set HTTPOnly Cookie upon login
app.post('/api/auth/jwt', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).send({ message: 'Email is required' });
  }

  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '7d' });

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }).send({ success: true, message: 'Authentication cookie issued' });
});

// Clear Cookie on Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }).send({ success: true, message: 'Logged out successfully' });
});

// Health check
app.get('/', (req, res) => {
  res.send('StudioSpace API Server is active and connected.');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});