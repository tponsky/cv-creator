# Quick Start - CV Creator Deployment

## Current Features

✅ Client-side CV parsing (chunked upload, no server timeouts)  
✅ Manual PMID entry with PubMed search links  
✅ Stripe billing integration  
✅ Health check endpoint (`/api/import/cv/health`)  

## Server Requirements

**Minimum:** t3.small (2GB RAM) with 2-4GB swap  
**Recommended:** t3.medium (4GB RAM) for smoother Docker builds

### Add Swap Space (Required for t3.small)
```bash
# SSH to server
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
```

## Quick Deployment

### From Local Machine (via SSH)
```bash
# Pull and rebuild with memory limit
ssh -i "your-key.pem" ec2-user@YOUR_IP "cd cv-creator && git pull && DOCKER_BUILDKIT=1 docker-compose build --no-cache app && docker-compose up -d"
```

### On Server Directly
```bash
cd cv-creator
git pull
DOCKER_BUILDKIT=1 docker-compose build --no-cache app
docker-compose up -d
```

### ⚠️ Avoid Server Crashes During Build
On low-memory servers (2GB), Docker builds can crash the server.

**Safe build process:**
```bash
# 1. Stop containers to free memory
docker-compose stop app worker

# 2. Build with memory limit
DOCKER_BUILDKIT=1 docker-compose build app

# 3. Start everything
docker-compose up -d
```

## Environment Variables

Required in `.env`:
```bash
OPENAI_API_KEY=sk-...
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=https://cv.staycurrentai.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NCBI_API_KEY=your-ncbi-key  # For faster PubMed API
```

## Verify Deployment

### Check Containers
```bash
docker-compose ps
# All should show "Up"
```

### Check Health
```bash
curl http://localhost:3001/api/import/cv/health
```

### Check Logs
```bash
docker-compose logs -f app
```

## Common Issues

### Server Crashes During Docker Build
- Add more swap space (see above)
- Stop containers before building
- Use `DOCKER_BUILDKIT=1` for efficient builds

### Site Won't Load (503/502)
```bash
# Restart Apache
sudo systemctl restart httpd

# Check Docker containers
docker-compose ps
docker-compose up -d
```

### PMID Enrichment
PMIDs are now added manually:
1. Click "🔍 Search PubMed" to open PubMed with title
2. Find article, copy PMID
3. Paste and click Save

## Files Changed Recently

- `src/app/settings/page.tsx` - Manual PMID entry UI
- `src/lib/billing.ts` - Stripe billing functions
- `prisma/schema.prisma` - User balance, Usage tracking

## Apache Configuration

Located at: `/etc/httpd/conf.d/cv.staycurrentai.com.conf`

Key settings:
```apache
ProxyTimeout 300
Timeout 300
```
