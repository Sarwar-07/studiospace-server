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

let db, studiosCollection, bookingsCollection, wishlistCollection;

async function connectDB() {
  try {
    await client.connect();
    db = client.db(process.env.DB_NAME || 'studiospace_db');
    studiosCollection = db.collection('studios');
    bookingsCollection = db.collection('bookings');
    wishlistCollection = db.collection('wishlist');
    
    await client.db('admin').command({ ping: 1 });
    console.log(`Connected to MongoDB Atlas: database "${process.env.DB_NAME}" is ready!`);
  } catch (error) {
    console.error('MongoDB connection failure:', error);
  }
}

connectDB();

// --- CHALLENGE 1: JWT & HTTPONLY COOKIE MIDDLEWARE ---

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

// --- STUDIOS CRUD ENDPOINTS ---

// 1. Featured Studios (Home page dynamic section - limit 6)
app.get('/api/studios/featured', async (req, res) => {
  try {
    const featured = await studiosCollection
      .find({})
      .sort({ rating: -1, createdAt: -1 })
      .limit(6)
      .toArray();
    res.send(featured);
  } catch (error) {
    res.status(500).send({ message: 'Failed to fetch featured studios', error });
  }
});

// 2. Explore Studios (With category filtering and search queries)
app.get('/api/studios', async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = {};

    if (category && category !== 'All') {
      query.category = category;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } }
      ];
    }

    const studios = await studiosCollection.find(query).toArray();
    res.send(studios);
  } catch (error) {
    res.status(500).send({ message: 'Failed to fetch studios', error });
  }
});

// 3. Single Studio Details
app.get('/api/studios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const studio = await studiosCollection.findOne({ _id: new ObjectId(id) });
    if (!studio) {
      return res.status(404).send({ message: 'Studio space not found' });
    }
    res.send(studio);
  } catch (error) {
    res.status(400).send({ message: 'Invalid Studio ID format', error });
  }
});

// 4. Add New Studio (Private Route - Guarded by verifyToken)
app.post('/api/studios', verifyToken, async (req, res) => {
  try {
    const newStudio = {
      ...req.body,
      hourlyRate: parseFloat(req.body.hourlyRate),
      securityDeposit: parseFloat(req.body.securityDeposit),
      maxCapacity: parseInt(req.body.maxCapacity),
      ownerEmail: req.user.email,
      rating: 5.0,
      reviewsCount: 0,
      createdAt: new Date()
    };

    const result = await studiosCollection.insertOne(newStudio);
    res.status(201).send(result);
  } catch (error) {
    res.status(500).send({ message: 'Failed to save studio listing', error });
  }
});

// 5. My Studio Listings (Private Route - Filtered by authenticated ownerEmail)
app.get('/api/my-listings', verifyToken, async (req, res) => {
  try {
    const listings = await studiosCollection
      .find({ ownerEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(listings);
  } catch (error) {
    res.status(500).send({ message: 'Failed to retrieve your listings', error });
  }
});

// 6. Update Studio Listing (Private Route - Ensures user owns the document)
app.patch('/api/studios/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.ownerEmail;

    if (updateData.hourlyRate) updateData.hourlyRate = parseFloat(updateData.hourlyRate);
    if (updateData.securityDeposit) updateData.securityDeposit = parseFloat(updateData.securityDeposit);
    if (updateData.maxCapacity) updateData.maxCapacity = parseInt(updateData.maxCapacity);

    const filter = { _id: new ObjectId(id), ownerEmail: req.user.email };
    const updateDoc = { $set: updateData };

    const result = await studiosCollection.updateOne(filter, updateDoc);
    if (result.matchedCount === 0) {
      return res.status(403).send({ message: 'Unauthorized or listing does not exist' });
    }
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: 'Failed to update studio listing', error });
  }
});

// 7. Delete Studio Listing (Private Route - Ensures user owns the document)
app.delete('/api/studios/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const filter = { _id: new ObjectId(id), ownerEmail: req.user.email };

    const result = await studiosCollection.deleteOne(filter);
    if (result.deletedCount === 0) {
      return res.status(403).send({ message: 'Unauthorized or listing does not exist' });
    }
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: 'Failed to delete studio listing', error });
  }
});

// --- CHALLENGE 2: BOOKINGS & DOUBLE-BOOKING PREVENTION ---

// 1. Create Booking with Overlap Detection
app.post('/api/bookings', verifyToken, async (req, res) => {
  try {
    const { studioId, bookingDate, startTime, endTime, hourlyRate, studioTitle, studioImage } = req.body;
    const sTime = parseInt(startTime);
    const eTime = parseInt(endTime);

    if (sTime >= eTime) {
      return res.status(400).send({ message: 'Start time must precede end time.' });
    }

    const existingConflict = await bookingsCollection.findOne({
      studioId: new ObjectId(studioId),
      bookingDate: bookingDate,
      status: { $in: ['Confirmed', 'Pending'] },
      $or: [
        { startTime: { $lt: eTime, $gte: sTime } },
        { endTime: { $gt: sTime, $lte: eTime } },
        { startTime: { $lte: sTime }, endTime: { $gte: eTime } }
      ]
    });

    if (existingConflict) {
      return res.status(409).send({
        message: 'Double Booking Conflict: This studio space is already booked during these hours. Please choose another time slot.'
      });
    }

    const totalHours = eTime - sTime;
    const totalPrice = totalHours * parseFloat(hourlyRate);

    const newBooking = {
      studioId: new ObjectId(studioId),
      studioTitle,
      studioImage,
      hourlyRate: parseFloat(hourlyRate),
      totalHours,
      totalPrice,
      bookingDate,
      startTime: sTime,
      endTime: eTime,
      userEmail: req.user.email,
      status: 'Pending',
      createdAt: new Date()
    };

    const result = await bookingsCollection.insertOne(newBooking);
    res.status(201).send(result);
  } catch (error) {
    res.status(500).send({ message: 'Failed to create booking', error });
  }
});

// 2. My Bookings (Private Route - Fetch user reservations)
app.get('/api/my-bookings', verifyToken, async (req, res) => {
  try {
    const bookings = await bookingsCollection
      .find({ userEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(bookings);
  } catch (error) {
    res.status(500).send({ message: 'Failed to fetch bookings', error });
  }
});

// 3. Cancel Booking (Private Route - Only allowed for pending bookings)
app.patch('/api/bookings/:id/cancel', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const filter = {
      _id: new ObjectId(id),
      userEmail: req.user.email,
      status: 'Pending'
    };

    const result = await bookingsCollection.updateOne(filter, {
      $set: { status: 'Cancelled', cancelledAt: new Date() }
    });

    if (result.matchedCount === 0) {
      return res.status(400).send({ message: 'Booking cannot be cancelled or was not found' });
    }

    res.send({ success: true, message: 'Booking successfully cancelled' });
  } catch (error) {
    res.status(500).send({ message: 'Failed to cancel booking', error });
  }
});

// --- OPTIONAL REQUIREMENT: SAVED STUDIOS WISHLIST ---

// 1. Save Studio to Wishlist
app.post('/api/wishlist', verifyToken, async (req, res) => {
  try {
    const { studioId } = req.body;
    if (!studioId) return res.status(400).send({ message: 'Studio ID is required' });

    const existing = await wishlistCollection.findOne({
      userEmail: req.user.email,
      studioId: new ObjectId(studioId)
    });

    if (existing) {
      return res.status(409).send({ message: 'Studio already saved in your wishlist' });
    }

    const result = await wishlistCollection.insertOne({
      userEmail: req.user.email,
      studioId: new ObjectId(studioId),
      createdAt: new Date()
    });

    res.status(201).send(result);
  } catch (error) {
    res.status(500).send({ message: 'Failed to add to wishlist', error });
  }
});

// 2. Get User Wishlist with Studio Details via Aggregation
app.get('/api/wishlist', verifyToken, async (req, res) => {
  try {
    const wishlist = await wishlistCollection.aggregate([
      { $match: { userEmail: req.user.email } },
      {
        $lookup: {
          from: 'studios',
          localField: 'studioId',
          foreignField: '_id',
          as: 'studio'
        }
      },
      { $unwind: '$studio' },
      { $sort: { createdAt: -1 } }
    ]).toArray();

    res.send(wishlist);
  } catch (error) {
    res.status(500).send({ message: 'Failed to retrieve wishlist', error });
  }
});

// 3. Remove Studio from Wishlist
app.delete('/api/wishlist/:studioId', verifyToken, async (req, res) => {
  try {
    const { studioId } = req.params;
    const result = await wishlistCollection.deleteOne({
      userEmail: req.user.email,
      studioId: new ObjectId(studioId)
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: 'Studio not found in wishlist' });
    }

    res.send({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    res.status(500).send({ message: 'Failed to remove from wishlist', error });
  }
});

// --- DASHBOARD ANALYTICS & STATS AGGREGATION ---

app.get('/api/dashboard/stats', verifyToken, async (req, res) => {
  try {
    const email = req.user.email;

    // 1. Total listed studios as a Host
    const totalListings = await studiosCollection.countDocuments({ ownerEmail: email });

    // 2. Total reservations made as a Creator
    const totalBookings = await bookingsCollection.countDocuments({ userEmail: email });

    // 3. Total items in Wishlist
    const totalWishlist = await wishlistCollection.countDocuments({ userEmail: email });

    // 4. Financial metrics: Total spent on completed/pending bookings
    const expenditureAggregate = await bookingsCollection.aggregate([
      { $match: { userEmail: email, status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, totalSpent: { $sum: '$totalPrice' } } }
    ]).toArray();

    const totalSpent = expenditureAggregate.length > 0 ? expenditureAggregate[0].totalSpent : 0;

    res.send({
      totalListings,
      totalBookings,
      totalWishlist,
      totalSpent
    });
  } catch (error) {
    res.status(500).send({ message: 'Failed to fetch dashboard metrics', error });
  }
});

// Base Route
app.get('/', (req, res) => {
  res.send('StudioSpace API Server is active and connected.');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});