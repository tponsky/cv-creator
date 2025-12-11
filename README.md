# CV Creator

Intelligent CV management web application with AI-powered content ingestion.

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL (or use Docker)

### Local Development

1. **Install dependencies**
```bash
npm install
```

2. **Set up environment**
```bash
cp .env.example .env
# Edit .env with your values
```

3. **Initialize database**
```bash
npx prisma generate
npx prisma db push
```

4. **Run development server**
```bash
npm run dev
```

### Docker Deployment

1. **Set environment variables**
```bash
export NEXTAUTH_SECRET="your-secret-key"
export ANTHROPIC_API_KEY="your-claude-key"
export NEXTAUTH_URL="https://your-domain.com"
```

2. **Start services**
```bash
docker-compose up -d
```

3. **Run database migrations**
```bash
docker-compose exec app npx prisma db push
```

## Features

- **Multi-tenant authentication** with email/password
- **CV Editor** with customizable categories
- **AI-powered ingestion** from PubMed, calendars, emails
- **Bio generator** with customizable styles
- **P&T template support** for institutional requirements

## Tech Stack

- Next.js 14 (App Router)
- PostgreSQL + Prisma
- NextAuth.js
- Claude AI (Anthropic)
- Tailwind CSS
