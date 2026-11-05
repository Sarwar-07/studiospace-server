# StudioSpace API Server

High-performance backend API service for **StudioSpace**, a peer-to-peer creative workspace and production studio sharing marketplace built with Express.js, MongoDB Atlas, and JWT authentication.

---

## Features & Challenge Implementations

- **Challenge 1 (JWT in HTTPOnly Cookies):** Secure session issuance via `/api/auth/jwt` and mutation route shielding with custom `verifyToken` middleware.
- **Challenge 2 (Double-Booking Conflict Engine):** Time collision detection query preventing concurrent reservations for overlapping time slots on the same date.
- **Studios CRUD Engine:** Endpoints for publishing, updating, viewing, and deleting studio listings with host authorization checks.
- **Aggregation Pipelines:** Integrated MongoDB `$lookup` queries for saved wishlists and dashboard analytics metrics.
- **Centralized Error & 404 Handling:** Structured JSON fallback responses for undefined routes and runtime errors.

---

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB Atlas (Native Driver)
- **Security:** JSONWebToken (`jsonwebtoken`), `cookie-parser`, `cors`
- **Deployment:** Vercel / Render

---

## API Endpoints

### Authentication
- `POST /api/auth/jwt` - Issue signed JWT inside an HTTPOnly cookie
- `POST /api/auth/logout` - Clear authentication cookie

### Studios
- `GET /api/studios/featured` - Get top 6 featured creative spaces
- `GET /api/studios` - Search and filter studios by discipline category
- `GET /api/studios/:id` - Fetch studio details by ObjectId
- `POST /api/studios` - Add a new studio listing *(Guarded)*
- `GET /api/my-listings` - Fetch listings created by the authenticated host *(Guarded)*
- `PATCH /api/studios/:id` - Update owned studio listing *(Guarded)*
- `DELETE /api/studios/:id` - Remove owned studio listing *(Guarded)*

### Bookings
- `POST /api/bookings` - Create reservation with double-booking collision prevention *(Guarded)*
- `GET /api/my-bookings` - Fetch user reservations *(Guarded)*
- `PATCH /api/bookings/:id/cancel` - Cancel a pending booking *(Guarded)*

### Wishlist & Stats
- `POST /api/wishlist` - Save a studio to favorites *(Guarded)*
- `GET /api/wishlist` - View user wishlist with studio details *(Guarded)*
- `DELETE /api/wishlist/:studioId` - Remove studio from wishlist *(Guarded)*
- `GET /api/dashboard/stats` - Fetch host and creator analytics metrics *(Guarded)*

---

## Local Setup

1. Clone repository:
   ```bash
   git clone [https://github.com/Sarwar-07/studiospace-server.git](https://github.com/Sarwar-07/studiospace-server.git)
   cd studiospace-server