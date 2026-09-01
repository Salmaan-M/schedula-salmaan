# Schedula Backend
A appointment scheduling backend project

## Deployment

The backend is deployed on Render with a Neon PostgreSQL database.

### Live API

```
https://schedula-salmaan.onrender.com
```

---

## Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL (or a Neon PostgreSQL instance)
- npm

### Installation

```bash
git clone <repository-url>
cd <repository-name>
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_jwt_secret
```

### Apply Database Migrations

```bash
npx prisma migrate deploy
```

For local development:

```bash
npx prisma migrate dev
```

### Generate Prisma Client

```bash
npx prisma generate
```

### Run the Application

```bash
npm run start:dev
```

The server will be available at:

```
http://localhost:3000
```

---

## Production Deployment

This project is configured for deployment on **Render** with **Neon PostgreSQL**.

Build Command:

```bash
npm install && npm run build && npx prisma generate && npx prisma migrate deploy
```

Start Command:

```bash
npm run start:prod
```

Required environment variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `NODE_ENV=production`
