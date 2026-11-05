import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { MongoClient, ServerApiVersion } from 'mongodb';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [process.env.CLIENT_URL || 'http://localhost:3000'],
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

let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db(process.env.DB_NAME || 'studiospace_db');
    
    // Ping the deployment to confirm connection
    await client.db('admin').command({ ping: 1 });
    console.log(`Connected to MongoDB Atlas: database "${process.env.DB_NAME}" is ready!`);
  } catch (error) {
    console.error('MongoDB connection failure:', error);
  }
}

connectDB();

// Health Check Route
app.get('/', (req, res) => {
  res.send('StudioSpace API Server is active and connected.');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});