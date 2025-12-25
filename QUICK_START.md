# Quick Start - CV Upload Fix

## What Was Fixed

✅ Enhanced worker error handling and logging  
✅ Added health check endpoint (`/api/import/cv/health`)  
✅ Improved upload error messages  
✅ Better frontend error handling  
✅ Graceful shutdown for worker  
✅ Connection validation on startup  

## Quick Deployment

### Option 1: Use the deployment script
```bash
./deploy.sh
```

### Option 2: Manual deployment
```bash
# Build and restart
docker-compose build
docker-compose down
docker-compose up -d

# Check worker is running
docker-compose ps worker

# Monitor worker logs
docker-compose logs -f worker
```

## Verify It's Working

### 1. Check Health Endpoint
```bash
curl http://your-server/api/import/cv/health
```

Expected response:
```json
{
  "status": "healthy",
  "checks": {
    "redis": { "status": "ok" },
    "database": { "status": "ok" },
    "queue": { "status": "ok", "message": "..." },
    "workers": { "status": "ok", "message": "..." }
  }
}
```

### 2. Check Worker is Running
```bash
docker-compose ps worker
# Should show "Up" status

docker-compose logs worker | tail -20
# Should show: "[Worker] CV processing worker started and listening for jobs..."
```

### 3. Test Upload
1. Go to Settings page
2. Upload a CV file
3. Check browser console for any errors
4. Monitor worker logs: `docker-compose logs -f worker`

## Common Issues & Quick Fixes

### Worker Not Running
```bash
docker-compose up -d worker
docker-compose logs worker
```

### Redis Connection Error
```bash
docker-compose restart redis
docker-compose logs redis
```

### Jobs Stuck
```bash
# Check queue status
docker-compose exec redis redis-cli
KEYS bull:cv-processing:*

# Restart worker
docker-compose restart worker
```

## Files Changed

- `src/lib/worker.ts` - Enhanced error handling
- `src/app/api/import/cv/upload/route.ts` - Better error messages
- `src/app/api/import/cv/health/route.ts` - NEW health check endpoint
- `src/app/settings/page.tsx` - Improved frontend error handling

## Monitoring

### Watch Worker Logs
```bash
docker-compose logs -f worker
```

### Watch All Logs
```bash
docker-compose logs -f
```

### Check Queue Status
```bash
curl http://your-server/api/import/cv/health | jq '.checks.queue'
```

## Need Help?

See `CV_UPLOAD_TROUBLESHOOTING.md` for detailed troubleshooting guide.


