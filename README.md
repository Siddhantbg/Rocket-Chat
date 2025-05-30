# 🚀 Rocket Chat

A scalable, real-time messaging platform designed for seamless team communication, optimized for performance, security, and intuitive user experience.
A production-grade, full-stack real-time chat application built with **React**, **TypeScript**, **Express**, **MongoDB**, and enhanced using **Docker**, **Socket.IO**, **Zustand**, **Upstash Redis**, and other modern technologies.

### 🔗 Live Demo: [rocket-chat-sable.vercel.app](https://rocket-chat-sable.vercel.app)  
### 🔗 Backend API: [rocket-chat-624j.onrender.com/api](https://rocket-chat-624j.onrender.com/api)

---

## 🛠 Tech Stack
- **Frontend:** React, TypeScript, Zustand, Tailwind CSS
- **Backend:** Node.js, Express, MongoDB, Upstash Redis, JWT, Cloudinary
- **Real-time Communication:** Socket.IO, WebSockets
- **DevOps:** Docker, GitHub Actions (CI/CD ready)
- **Deployment:** Docker containers, suitable for Kubernetes or Render deployments

---

## 📐 System Architecture
![Rocket Chat Architecture](assets/architecture.png)

---

## 🚧 Technical Challenges Faced & Solutions
- **Handling WebSocket Scalability**: Implemented Redis Pub/Sub for distributed event broadcasting across multiple server instances.
- **Real-Time Delivery Confirmations**: Designed a robust optimistic UI with client-side message state management and backend confirmations.
- **Rate Limiting & Caching**: Optimized API performance using middleware with Redis-backed rate limiting and caching mechanisms.

---

## 📸 Screenshots & Demonstrations
![Login Screen](assets/ss.png)
![Real-Time Chat](assets/link.png)

---
### Infrastructure & Deployment
- Vercel (frontend)
- Render (backend/API)
- Docker Compose (multi-service orchestration)

---

## 🚦 Key Libraries
- **Zustand** — global, fast, simple state management
- **Socket.IO** — reliable, scalable real-time messaging
- **Multer** + **Cloudinary Storage** — file uploads
- **bcryptjs** & **JWT** — authentication & authorization
- **Upstash Redis** — rate limiting and caching
- **Nodemon** — hot reloading backend during dev

---

## ⚡ Features

### 💬 Real-Time Chat
- Instant messaging
- Online presence
- Read & delivered receipts (✓✓)
- "Seen at" indicators (Instagram-style)
- Typing indicators
- Public and private rooms
- Media sharing (images, videos, docs)

### 🔒 Secure Authentication
- JWT-based auth
- Secure session handling
- Password hashing with bcrypt

### 📈 API Optimization
- Redis-powered rate limiting
- Server-side caching for fast access

### 🐳 Scalable & Modern DevOps
- Fully Dockerized
- CI/CD ready
- Environment-variable driven config

### 🖼 File Uploads
- Image/video/document sharing
- Media hosted on Cloudinary

### 🧑‍💻 Developer Experience
- TypeScript across the stack
- Modular, scalable codebase
- REST & WebSocket APIs
- Docker Compose for local dev

---

## 🌐 Deployment Overview

| Layer            | Platform | Technology                 | Notes                    |
|------------------|----------|-----------------------------|--------------------------|
| Frontend         | Vercel   | React, Vite, TypeScript     | [Live Demo](https://rocket-chat-sable.vercel.app) |
| Backend/API      | Render   | Node.js, Express, Socket.IO | [API](https://rocket-chat-624j.onrender.com/api) |
| Database         | MongoDB  | Atlas or Render-hosted      |                         |
| Media Storage    | Cloudinary | Cloudinary                 | For file/media uploads  |
| Caching/RateLimit| Upstash  | Redis (Serverless)          |                         |
| Containerization | Docker   | Docker, Docker Compose      | For local/prod setups   |

---

## 🏁 Getting Started

### 🔧 Local Setup (with Docker)
```bash
# Clone the repo
git clone https://github.com/yourusername/rocket-chat.git
cd rocket-chat

# Copy env example files and fill values
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Start all services
docker-compose up --build
---
```
## 🔧 Manual Setup (Non-Docker)

```bash
# Backend setup
cd backend
npm install
npm run dev

# Frontend setup
cd frontend
npm install
npm run dev
```
---

## 📚 API & Socket Documentation

### 📦 REST Endpoints
- `POST /api/auth` — Register/Login
- `GET /api/messages` — Retrieve messages
- `POST /api/messages` — Send message
- `POST /api/rooms` — Create/Join/Leave room

### 🔌 Socket.IO Events
- `message:send`, `message:receive`
- `user:connect`, `room:join`
- `message:read`, `message:delivered`
- `typing:start`, `typing:stop`
- ...and more

---

## 🔐 Environment Variables

### 🌐 Frontend
- `VITE_SOCKET_URL`
- `VITE_API_URL`

### 🛠 Backend
- `FRONTEND_URL`
- `MONGODB_URI`
- `JWT_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CLOUDINARY_URL`

---

## 💡 Highlights

- ⚡ **Real-time communication** using Socket.IO
- 🔐 **Secure JWT authentication**
- 🚦 **Rate limiting & caching** via Upstash Redis
- 🐳 **Dockerized**, production-ready architecture
- 🌎 **Cloud-native deployment** with Vercel & Render

---

## 🚀 Future Roadmap
- Integrate OAuth (Google, Microsoft) authentication
- Advanced analytics and monitoring dashboards
- Native mobile app (React Native)

---
## 👨‍💻 Maintainer

**Siddhant Bhagat**  
[LinkedIn →](https://www.linkedin.com/feed/)

---

⭐️ _Star this repo if you found it useful!_  
_Built with passion for speed, scalability, and developer happiness._
