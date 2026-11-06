# StudioSpace Backend API

Express.js and MongoDB REST API powering the **StudioSpace** creative workspace and production studio sharing marketplace.

---

## 🔗 Project Links

| Resource | URL |
| :--- | :--- |
| **Live API Endpoint** | [https://studiospace-server-livid.vercel.app](https://studiospace-server-livid.vercel.app) |
| **Live Client Application** | [https://studiospace-client-eta-six.vercel.app](https://studiospace-client-eta-six.vercel.app) |
| **Client Repository** | [https://github.com/Sarwar-07/studiospace-client](https://github.com/Sarwar-07/studiospace-client) |
| **Server Repository** | [https://github.com/Sarwar-07/studiospace-server](https://github.com/Sarwar-07/studiospace-server) |

---

## 🚀 Tech Stack

- **Runtime Environment:** [Node.js](https://nodejs.org/) (ES Modules)
- **Web Framework:** [Express.js](https://expressjs.com/)
- **Database:** [MongoDB Atlas](https://www.mongodb.com/atlas) (Native Node.js Driver `mongodb`)
- **Authentication & Security:** 
  - [JSONWebToken (JWT)](https://github.com/auth0/node-jsonwebtoken) for stateless session authorization
  - [`cookie-parser`](https://github.com/expressjs/cookie-parser) for secure HTTP-only cookie parsing
  - [`cors`](https://github.com/expressjs/cors) with dynamic multi-origin and credential support
- **Configuration & Utilities:** [`dotenv`](https://github.com/motdotla/dotenv)
- **Deployment Platform:** [Vercel Serverless Functions](https://vercel.com/)

---

## ✨ Key Features & Implementations

1. **Dual Session Authentication (Cookie + Bearer Token):**
   - Issues signed JWT tokens via `POST /api/jwt` (and `/api/auth/jwt`).
   - Sets secure, cross-domain HTTP-only cookies (`SameSite: None`, `Secure: true`) while simultaneously returning `{ token }` in the JSON response payload.
   - `verifyToken` middleware transparently checks the `Authorization: Bearer <token>` header first and falls back to HTTP-only cookies.

2. **Studio Spaces CRUD Engine:**
   - Full lifecycle management for studio listings (create, read, update, delete).
   - Comprehensive query support: discipline category filtering, text search regex, and sorting.
   - Strict ownership protection ensures only the listing host (`req.user.email`) can update or remove their spaces.

3. **Double-Booking Collision Prevention:**
   - Booking reservations check for overlapping time blocks (`startTime`, `endTime`) on the requested date for any non-cancelled reservation, returning a `409 Conflict` if double-booked.

4. **MongoDB Aggregation Pipelines:**
   - Aggregated `$lookup` joins between `wishlist` and `studios` collections to hydrate favorite listings.
   - Real-time creator and host dashboard metrics (total listings, total reservations, saved wishlists, and cumulative earnings/expenditure).

5. **Serverless Optimized Architecture:**
   - Resilient MongoDB connection pooling with cached references across warm serverless container invocations.
   - Root `/` and authentication endpoints respond instantly without blocking on initial database connections.
   - Dual-mounted route aliases (`/api/*` and `/*`) to prevent routing path rewrites on Vercel.

---

## 📌 Core API Endpoints

### 🔐 Authentication

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/jwt` *(or `/api/auth/jwt`)* | Public | Issue signed JWT session token (HTTP-only cookie + response JSON body) |
| `POST` | `/api/auth/logout` | Public | Clear HTTP-only session cookie |

### 🎙️ Studios Management

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/studios` | Public | Fetch all studio listings (supports `?category=`, `?search=`, and sorting) |
| `GET` | `/api/studios/:id` | Public | Fetch detailed specifications for a single space by ObjectId |
| `GET` | `/api/studios/featured` | Public | Fetch top 6 highest-rated featured creative spaces |
| `POST` | `/api/studios` | Protected | Add a new studio listing (secured route, assigns authenticated owner) |
| `PUT` | `/api/studios/:id` | Protected | Update existing studio listing (owner verified) |
| `PATCH` | `/api/studios/:id` | Protected | Partially update studio listing (owner verified) |
| `DELETE`| `/api/studios/:id` | Protected | Delete a studio listing (owner verified) |
| `GET` | `/api/my-listings` | Protected | Retrieve all studio spaces owned by authenticated host |
| `GET` | `/api/studios/user/:email` | Protected | Retrieve listings matching the authenticated user's email |

### 📅 Bookings & Reservations

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/bookings` | Protected | Reserve studio slot with double-booking collision prevention |
| `GET` | `/api/my-bookings` | Protected | Fetch active and past reservations made by the authenticated user |
| `PATCH` | `/api/bookings/:id/cancel` | Protected | Cancel a pending reservation |

### ⭐ Wishlist & Dashboard Analytics

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/wishlist` | Protected | Add a studio space to user's saved favorites |
| `GET` | `/api/wishlist` | Protected | Fetch user favorites with aggregated studio details via `$lookup` |
| `DELETE`| `/api/wishlist/:studioId` | Protected | Remove a studio space from saved favorites |
| `GET` | `/api/dashboard/stats` | Protected | Fetch analytics metrics (total listings, bookings, wishlist, total spent) |

### 🩺 System & Health

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/` *(or `/health`)* | Public | System status and health check verification |

---

## 💻 Environment Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/Sarwar-07/studiospace-server.git
cd studiospace-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables Configuration

Create a `.env` file in the root directory:

```env
# Application Port
PORT=5000

# Environment Mode
NODE_ENV=development

# MongoDB Atlas Connection URI
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.example.mongodb.net/?retryWrites=true&w=majority
DB_NAME=studiospace_db

# JWT Access Token Secret
ACCESS_TOKEN_SECRET=your_jwt_secret_key_minimum_32_characters_here
JWT_SECRET=your_jwt_secret_key_minimum_32_characters_here

# Client Application URL for CORS
CLIENT_URL=http://localhost:3000
```

### 4. Run Locally

- **Development Mode (with auto-reload):**
  ```bash
  npm run dev
  ```

- **Production Mode:**
  ```bash
  npm start
  ```

### 5. Automated API Test Suite

Run the built-in end-to-end API lifecycle test script:

```bash
npm run test:flow
```

The script verifies:
1. `POST /api/auth/jwt` session token issuance
2. `GET /api/studios` public listing query
3. `POST /api/studios` guarded space creation
4. `PUT /api/studios/:id` guarded space price update
5. `DELETE /api/studios/:id` guarded space deletion & 404 confirmation

---

## 📄 License

This project is submitted as an educational assignment for **Programming Hero**. All rights reserved.
