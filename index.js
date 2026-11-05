import dns from 'node:dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignored in environments where custom DNS servers cannot be set
}

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Normalize /index.js prefix if forwarded by Vercel serverless rewrite
app.use((req, res, next) => {
  if (req.url.startsWith('/index.js')) {
    const cleaned = req.url.slice('/index.js'.length);
    req.url = cleaned.startsWith('/') ? cleaned : '/' + cleaned;
  }
  next();
});

// Multi-origin CORS configuration allowing credentials for HTTPOnly cookies & dynamic Vercel deployments
const allowedOrigins = [
  'https://studiospace-client-eta-six.vercel.app',
  'https://studiospace-client-git-main-sarwar5.vercel.app',
  'http://localhost:3000',
  process.env.CLIENT_URL,
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') // Automatically trust your Vercel deployments
    ) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Ensure preflight OPTIONS requests return 204/200 immediately
try {
  app.options('*', cors(corsOptions));
} catch {
  app.options(/(.*)/, cors(corsOptions));
}
app.use(express.json());
app.use(cookieParser());

// MongoDB Client Initialization with Serverless-safe Connection Caching
const uri = process.env.MONGODB_URI;
let client = null;
let db = null;
let studiosCollection = null;
let bookingsCollection = null;
let wishlistCollection = null;

if (uri) {
  try {
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });
    db = client.db(process.env.DB_NAME || 'studiospace_db');
    studiosCollection = db.collection('studios');
    bookingsCollection = db.collection('bookings');
    wishlistCollection = db.collection('wishlist');
  } catch (err) {
    console.error('Failed to initialize MongoDB client:', err.message);
  }
}

let isConnecting = false;
async function connectDB() {
  if (!uri) {
    console.warn('MONGODB_URI is not configured.');
    return null;
  }

  if (isConnecting) {
    let attempts = 0;
    while (isConnecting && attempts < 25) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }
    return db;
  }

  isConnecting = true;
  try {
    if (!client) {
      client = new MongoClient(uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        }
      });
      db = client.db(process.env.DB_NAME || 'studiospace_db');
      studiosCollection = db.collection('studios');
      bookingsCollection = db.collection('bookings');
      wishlistCollection = db.collection('wishlist');
    }

    await client.connect();
    console.log(`Connected to MongoDB Atlas: database "${process.env.DB_NAME || 'studiospace_db'}" is ready!`);
    return db;
  } catch (error) {
    console.error('MongoDB connection failure in serverless environment:', error.message);
    return null;
  } finally {
    isConnecting = false;
  }
}

// Initial connection attempt wrapped so unhandled promises never crash serverless boot
connectDB().catch(err => {
  console.error('Initial connectDB unhandled error:', err.message);
});

// Middleware to ensure DB connection is ready for database-dependent routes
app.use(async (req, res, next) => {
  // Let health check and basic auth endpoints respond without blocking on DB
  if (
    req.path === '/' ||
    req.path === '/health' ||
    req.path === '/api/health' ||
    req.path === '/api/auth/jwt' ||
    req.path === '/auth/jwt' ||
    req.path === '/api/auth/logout' ||
    req.path === '/auth/logout'
  ) {
    return next();
  }

  try {
    if (!db || !studiosCollection) {
      await connectDB();
    }
    next();
  } catch (err) {
    console.error('Database connection middleware error:', err);
    res.status(503).json({
      success: false,
      message: 'Database service is currently initializing or unavailable'
    });
  }
});

// --- CHALLENGE 1: JWT & HTTPONLY COOKIE MIDDLEWARE ---

export const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access: No token provided' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized access: Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

// ==========================================
// 1. AUTH ROUTES (/api/auth & /auth)
// ==========================================
const authRouter = express.Router();

// Generate JWT and set HTTPOnly Cookie upon login
authRouter.post('/jwt', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).send({ message: 'Email is required' });
  }

  const token = jwt.sign(
    { email },
    process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  }).send({ success: true });
});

// Clear Cookie on Logout
authRouter.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 0,
  }).send({ success: true });
});

app.use('/api/auth', authRouter);
app.use('/auth', authRouter);

// ==========================================
// 2. STUDIOS CRUD ROUTES (/api/studios & /studios)
// ==========================================
const studiosRouter = express.Router();

// 1. Featured Studios (Home page dynamic section - limit 6)
studiosRouter.get('/featured', async (req, res, next) => {
  try {
    const featured = await studiosCollection
      .find({})
      .sort({ rating: -1, createdAt: -1 })
      .limit(6)
      .toArray();
    res.send(featured);
  } catch (error) {
    next(error);
  }
});

// 2. User-specific Studios Listings (GET /api/studios/user/:email)
studiosRouter.get('/user/:email', verifyToken, async (req, res, next) => {
  try {
    const { email } = req.params;
    if (req.user.email !== email) {
      return res.status(403).send({ message: 'Forbidden: Cannot view listings for another user' });
    }
    const listings = await studiosCollection
      .find({ ownerEmail: email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(listings);
  } catch (error) {
    next(error);
  }
});

// 3. Explore Studios (With category filtering and search queries)
studiosRouter.get('/', async (req, res, next) => {
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
    next(error);
  }
});

// 4. Single Studio Details
studiosRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid studio ID format' });
    }
    const studio = await studiosCollection.findOne({ _id: new ObjectId(id) });
    if (!studio) {
      return res.status(404).send({ message: 'Studio space not found' });
    }
    res.send(studio);
  } catch (error) {
    next(error);
  }
});

// 5. Add New Studio (Private Route - Guarded by verifyToken)
studiosRouter.post('/', verifyToken, async (req, res, next) => {
  try {
    const newStudio = {
      ...req.body,
      hourlyRate: req.body.hourlyRate !== undefined ? parseFloat(req.body.hourlyRate) : 0,
      securityDeposit: req.body.securityDeposit !== undefined ? parseFloat(req.body.securityDeposit) : 0,
      maxCapacity: req.body.maxCapacity !== undefined ? parseInt(req.body.maxCapacity) : 1,
      ownerEmail: req.user.email,
      rating: req.body.rating !== undefined ? parseFloat(req.body.rating) : 5.0,
      reviewsCount: req.body.reviewsCount !== undefined ? parseInt(req.body.reviewsCount) : 0,
      createdAt: new Date()
    };

    const result = await studiosCollection.insertOne(newStudio);
    res.status(201).send(result);
  } catch (error) {
    next(error);
  }
});

// 6. Update Studio Listing (Private Route - PUT and PATCH supported)
const updateStudioHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid studio ID format' });
    }

    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.ownerEmail;

    if (updateData.hourlyRate !== undefined) updateData.hourlyRate = parseFloat(updateData.hourlyRate);
    if (updateData.securityDeposit !== undefined) updateData.securityDeposit = parseFloat(updateData.securityDeposit);
    if (updateData.maxCapacity !== undefined) updateData.maxCapacity = parseInt(updateData.maxCapacity);

    const filter = { _id: new ObjectId(id), ownerEmail: req.user.email };
    const updateDoc = { $set: updateData };

    const result = await studiosCollection.updateOne(filter, updateDoc);
    if (result.matchedCount === 0) {
      return res.status(403).send({ message: 'Unauthorized or listing does not exist' });
    }
    res.send(result);
  } catch (error) {
    next(error);
  }
};

studiosRouter.put('/:id', verifyToken, updateStudioHandler);
studiosRouter.patch('/:id', verifyToken, updateStudioHandler);

// 7. Delete Studio Listing (Private Route - Ensures user owns document)
studiosRouter.delete('/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid studio ID format' });
    }

    const filter = { _id: new ObjectId(id), ownerEmail: req.user.email };

    const result = await studiosCollection.deleteOne(filter);
    if (result.deletedCount === 0) {
      return res.status(403).send({ message: 'Unauthorized or listing does not exist' });
    }
    res.send(result);
  } catch (error) {
    next(error);
  }
});

app.use('/api/studios', studiosRouter);
app.use('/studios', studiosRouter);

// Host's Own Studio Listings (/api/my-listings & /my-listings)
const myListingsHandler = async (req, res, next) => {
  try {
    const listings = await studiosCollection
      .find({ ownerEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(listings);
  } catch (error) {
    next(error);
  }
};
app.get(['/api/my-listings', '/my-listings'], verifyToken, myListingsHandler);

// ==========================================
// 3. BOOKINGS ROUTES (/api/bookings & /bookings)
// ==========================================
const bookingsRouter = express.Router();

// 1. Create Booking with Overlap Detection
bookingsRouter.post('/', verifyToken, async (req, res, next) => {
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
    next(error);
  }
});

// 2. Cancel Booking
bookingsRouter.patch('/:id/cancel', verifyToken, async (req, res, next) => {
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
    next(error);
  }
});

app.use('/api/bookings', bookingsRouter);
app.use('/bookings', bookingsRouter);

// User's Own Bookings (/api/my-bookings & /my-bookings)
const myBookingsHandler = async (req, res, next) => {
  try {
    const bookings = await bookingsCollection
      .find({ userEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(bookings);
  } catch (error) {
    next(error);
  }
};
app.get(['/api/my-bookings', '/my-bookings'], verifyToken, myBookingsHandler);

// ==========================================
// 4. WISHLIST ROUTES (/api/wishlist & /wishlist)
// ==========================================
const wishlistRouter = express.Router();

// 1. Save Studio to Wishlist
wishlistRouter.post('/', verifyToken, async (req, res, next) => {
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
    next(error);
  }
});

// 2. Get User Wishlist with Studio Details via Aggregation
wishlistRouter.get('/', verifyToken, async (req, res, next) => {
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
    next(error);
  }
});

// 3. Remove Studio from Wishlist
wishlistRouter.delete('/:studioId', verifyToken, async (req, res, next) => {
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
    next(error);
  }
});

app.use('/api/wishlist', wishlistRouter);
app.use('/wishlist', wishlistRouter);

// ==========================================
// 5. DASHBOARD STATS (/api/dashboard & /dashboard)
// ==========================================
const dashboardRouter = express.Router();

dashboardRouter.get('/stats', verifyToken, async (req, res, next) => {
  try {
    const email = req.user.email;

    const totalListings = await studiosCollection.countDocuments({ ownerEmail: email });
    const totalBookings = await bookingsCollection.countDocuments({ userEmail: email });
    const totalWishlist = await wishlistCollection.countDocuments({ userEmail: email });

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
    next(error);
  }
});

app.use('/api/dashboard', dashboardRouter);
app.use('/dashboard', dashboardRouter);

// ==========================================
// 6. HEALTH CHECK & BASE ROUTES
// ==========================================
app.get(['/', '/health', '/api/health'], (req, res) => {
  res.status(200).json({ 
    message: 'StudioSpace API Server is active',
    status: 'healthy' 
  });
});

// ==========================================
// 7. 404 CATCH-ALL & GLOBAL ERROR HANDLER
// ==========================================
// 404 Route Catcher for Unhandled Endpoints (strictly placed after all routes)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.originalUrl} not found on StudioSpace server.`
  });
});

// Centralized Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('Server Internal Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

export default app;
export { app };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = app;
}
