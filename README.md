# MedAssist — Medical Assistance Web Application

A full-stack medical assistance platform with:
- Secure user authentication (JWT + bcrypt)
- Personal medical dashboard
- Medical records, medications, allergies & vital signs tracking
- AI-powered symptom analyzer (OpenAI GPT-4o-mini)
- Responsive design for all devices

---

## Quick Start

### Prerequisites
- Node.js v18+
- MongoDB (local or MongoDB Atlas)
- OpenAI API key (optional — graceful fallback if not set)

### 1. Install Backend Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `server/.env` and set:
- `MONGODB_URI` — your MongoDB connection string
- `JWT_SECRET` — a long, random string (min 32 chars)
- `OPENAI_API_KEY` — your OpenAI API key (from platform.openai.com)
- `PYTHON_EXECUTABLE` — optional absolute Python path for ML analytics predictions (recommended on Windows)
- Email settings (optional, for email verification)

### 3. Start the Backend Server

```bash
cd server
npm run dev       # development (with nodemon)
# OR
npm start         # production
```

The API will be available at `http://localhost:5000`

### 4. Serve the Frontend

Open the `client/` directory with any static file server:

**Option A — VS Code Live Server:**
Right-click `client/index.html` → Open with Live Server

**Option B — Python:**
```bash
cd client
python -m http.server 3000
```

**Option C — npx serve:**
```bash
npx serve client -p 3000
```

Then open: `http://localhost:3000`

---

## Render Deployment (With ML Predictions)

To enable Python-based analytics predictions on Render, ensure both Node and Python dependencies are installed during build.

### Option A — Use Blueprint

This repo now includes [render.yaml](render.yaml). In Render:
- Create a new **Blueprint** instance from this repository.
- Render will use the build/start commands defined in [render.yaml](render.yaml).

### Option B — Existing Web Service (Manual Settings)

For an existing Render web service, set:
- Build Command:
    `npm install --prefix server && pip install -r ml/requirements.txt`
- Start Command:
    `npm start --prefix server`
- Environment Variable:
    `PYTHON_EXECUTABLE=python3`

Python packages are pinned in [ml/requirements.txt](ml/requirements.txt).

After deploy, verify:
- `GET /api/analytics/predict` returns `"modelSource":"ml"`
- The analytics page no longer shows the ML unavailable warning.

---

## Project Structure

```
├── server/                     # Node.js/Express backend
│   ├── server.js               # Main entry point
│   ├── .env                    # Environment variables (create from .env.example)
│   ├── middleware/
│   │   ├── auth.js             # JWT authentication middleware
│   │   ├── rateLimiter.js      # Rate limiting (express-rate-limit)
│   │   └── validation.js       # Input validation (express-validator)
│   ├── models/
│   │   ├── User.js             # User schema with medical data
│   │   └── SymptomQuery.js     # Symptom analysis query schema
│   ├── routes/
│   │   ├── auth.js             # /api/auth/* — register, login, verify email
│   │   ├── user.js             # /api/user/* — profile, medical data
│   │   └── symptoms.js         # /api/symptoms/* — AI analysis, history
│   └── utils/
│       ├── logger.js           # Winston logger
│       └── email.js            # Nodemailer email utilities
│
└── client/                     # Frontend (HTML/CSS/JS)
    ├── index.html              # Landing page
    ├── login.html              # Login page
    ├── register.html           # Multi-step registration
    ├── dashboard.html          # User dashboard
    ├── analyzer.html           # AI symptom analyzer
    ├── forgot-password.html    # Password reset request
    ├── reset-password.html     # Password reset form
    ├── verify-email.html       # Email verification handler
    ├── css/
    │   ├── main.css            # Global styles, navbar, footer, utilities
    │   ├── auth.css            # Auth pages (login/register)
    │   ├── dashboard.css       # Dashboard layout and components
    │   └── analyzer.css        # Symptom analyzer styles
    └── js/
        ├── utils.js            # Shared API client, Toast, Auth helpers
        ├── dashboard.js        # Dashboard logic
        └── analyzer.js         # Symptom analyzer logic
```

---

## API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Create new account |
| POST | `/login` | Login (returns JWT) |
| GET | `/me` | Get current user (requires auth) |
| GET | `/verify-email/:token` | Verify email address |
| POST | `/forgot-password` | Request password reset |
| POST | `/reset-password/:token` | Reset password |

### User (`/api/user`) — All require Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/profile` | Get full profile |
| PUT | `/profile` | Update profile info |
| POST | `/vital-signs` | Add vital signs entry |
| POST | `/medications` | Add medication |
| DELETE | `/medications/:index` | Remove medication |
| POST | `/allergies` | Add allergy |
| DELETE | `/allergies/:index` | Remove allergy |
| POST | `/medical-records` | Add record (with file upload) |
| DELETE | `/medical-records/:id` | Delete record |
| PUT | `/change-password` | Change password |
| DELETE | `/account` | Delete account |

### Symptoms (`/api/symptoms`) — All require Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/analyze` | Run AI symptom analysis |
| GET | `/history` | Get analysis history (paginated) |
| GET | `/:id` | Get specific analysis |
| POST | `/:id/rate` | Rate analysis helpfulness |
| DELETE | `/:id` | Delete analysis |

---

## Security Features

- **Authentication**: JWT tokens with configurable expiry + "Remember Me" (30 days)
- **Password Security**: bcrypt with salt rounds 12 + strength validation
- **Account Lockout**: 5 failed attempts → 2-hour lockout
- **Rate Limiting**: 10 login attempts / 15 min, 5 registrations / hour, 20 AI queries / hour
- **Input Sanitization**: `express-mongo-sanitize` (NoSQL injection prevention), `express-validator`
- **Security Headers**: Helmet.js with CSP
- **File Uploads**: Type validation, 5MB size limit
- **Email Verification**: 24-hour token expiry
- **Password Reset**: 30-minute token expiry

---

## Medical Disclaimer

MedAssist is for **informational purposes only** and does NOT provide medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional for medical concerns. In emergencies, call 911 immediately.
