# Deployment Instructions

## Quick Deploy to Your Server

### Step 1: Copy Files to Server
If you haven't already, copy the updated files to your server:

```bash
# On your local machine, from the project directory:
rsync -avz --exclude 'node_modules' --exclude '.next' \
  ./ user@your-server:/path/to/cv-creator/
```

Or use git if you have a repository:
```bash
git add .
git commit -m "Fix CV upload with enhanced worker and health checks"
git push
# Then on server: git pull
```

### Step 2: SSH into Your Server
```bash
ssh user@your-server
cd /path/to/cv-creator
```

### Step 3: Deploy Using Docker Compose

**Option A: Use the deployment script**
```bash
chmod +x deploy.sh
./deploy.sh
```

**Option B: Manual deployment**
```bash
# Build new images
docker-compose build

# Stop existing containers
docker-compose down

# Start all services (including worker)
docker-compose up -d

# Verify worker is running
docker-compose ps worker

# Check worker logs
docker-compose logs worker | tail -50
```

### Step 4: Verify Deployment

1. **Check health endpoint:**
```bash
curl http://localhost:3001/api/import/cv/health
# Or if behind a proxy:
curl http://your-domain.com/api/import/cv/health
```

Expected output should show all checks as "ok".

2. **Verify worker is running:**
```bash
docker-compose ps
# Should show worker container as "Up"

docker-compose logs worker | grep "started and listening"
# Should show: "[Worker] CV processing worker started and listening for jobs..."
```

3. **Monitor worker logs:**
```bash
docker-compose logs -f worker
```

### Step 5: Test CV Upload

1. Open your application in a browser
2. Go to Settings page
3. Upload a test CV file
4. Watch the worker logs to see it process:
```bash
docker-compose logs -f worker
```

## Troubleshooting

### Worker Not Starting
```bash
# Check worker logs for errors
docker-compose logs worker

# Common issues:
# - Redis connection failed → Check REDIS_URL
# - Database connection failed → Check DATABASE_URL
# - Missing API keys → Check environment variables
```

### Worker Container Keeps Restarting
```bash
# Check logs
docker-compose logs worker

# Check environment variables
docker-compose exec worker env | grep -E "REDIS|DATABASE|API_KEY"
```

### Jobs Not Processing
```bash
# Check if worker is actually running
docker-compose ps worker

# Check queue status
curl http://localhost:3001/api/import/cv/health | jq '.checks.queue'

# Restart worker
docker-compose restart worker
```

## Rollback (if needed)

If something goes wrong:
```bash
# Stop new containers
docker-compose down

# Use previous images (if you tagged them)
# Or rebuild from previous commit
git checkout <previous-commit>
docker-compose build
docker-compose up -d
```

## Files Changed in This Deployment

- ✅ `src/lib/worker.ts` - Enhanced error handling
- ✅ `src/app/api/import/cv/upload/route.ts` - Better error messages  
- ✅ `src/app/api/import/cv/health/route.ts` - NEW health check
- ✅ `src/app/settings/page.tsx` - Improved frontend

## Post-Deployment Checklist

- [ ] Worker container is running (`docker-compose ps worker`)
- [ ] Health endpoint returns "healthy" status
- [ ] Worker logs show "started and listening for jobs"
- [ ] Test CV upload works end-to-end
- [ ] No errors in worker logs during test upload

## Monitoring Commands

```bash
# Watch all logs
docker-compose logs -f

# Watch just worker
docker-compose logs -f worker

# Check service status
docker-compose ps

# Check health endpoint
watch -n 5 'curl -s http://localhost:3001/api/import/cv/health | jq'
```

