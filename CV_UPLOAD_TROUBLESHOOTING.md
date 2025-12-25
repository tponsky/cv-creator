# CV Upload Troubleshooting Guide

## Overview
This guide helps diagnose and fix issues with the CV upload functionality in the CV Creator application.

## Architecture
The CV upload process uses a queue-based system:
1. **Frontend** uploads file to `/api/import/cv/upload`
2. **API** extracts text and queues a job in Redis/BullMQ
3. **Worker** (separate process) processes jobs from the queue
4. **Frontend** polls `/api/import/cv/status/[jobId]` for progress

## Common Issues

### 1. Worker Not Running
**Symptoms:**
- Upload succeeds but job never processes
- Jobs stuck in "waiting" state
- Status endpoint returns 404 after a while

**Diagnosis:**
```bash
# Check if worker container is running
docker-compose ps

# Check worker logs
docker-compose logs worker

# Check if worker process is running (if not using Docker)
ps aux | grep "npm run worker"
```

**Solution:**
```bash
# Start worker if not running
docker-compose up -d worker

# Or manually
npm run worker
```

### 2. Redis Connection Issues
**Symptoms:**
- Upload fails with "Failed to queue job"
- Health check shows Redis error

**Diagnosis:**
```bash
# Check Redis container
docker-compose ps redis

# Test Redis connection
docker-compose exec redis redis-cli ping

# Check Redis logs
docker-compose logs redis
```

**Solution:**
```bash
# Restart Redis
docker-compose restart redis

# Check REDIS_URL environment variable matches
# Should be: redis://redis:6379 (in Docker) or redis://localhost:6379 (local)
```

### 3. Database Connection Issues
**Symptoms:**
- Worker starts but fails when processing
- Health check shows database error

**Diagnosis:**
```bash
# Check database container
docker-compose ps db

# Test database connection
docker-compose exec db psql -U cvuser -d cv_creator -c "SELECT 1;"

# Check database logs
docker-compose logs db
```

### 4. AI API Key Issues
**Symptoms:**
- Worker processes but fails during parsing
- Error: "All configured AI providers failed"

**Diagnosis:**
```bash
# Check environment variables
docker-compose exec app env | grep API_KEY

# Check worker logs for API errors
docker-compose logs worker | grep -i "api\|error"
```

**Solution:**
- Ensure at least one of these is set: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`
- Verify API keys are valid and have quota

## Health Check Endpoint

Use the health check endpoint to diagnose issues:

```bash
curl http://your-server/api/import/cv/health
```

Response includes:
- **Redis status**: Connection to Redis
- **Database status**: Connection to PostgreSQL
- **Queue status**: Job counts (waiting, active, completed, failed)
- **Workers status**: Whether workers appear to be running

Example healthy response:
```json
{
  "status": "healthy",
  "checks": {
    "redis": { "status": "ok" },
    "database": { "status": "ok" },
    "queue": { "status": "ok", "message": "Waiting: 0, Active: 1, Completed: 5, Failed: 0" },
    "workers": { "status": "ok", "message": "Active jobs: 1, Waiting jobs: 0. Workers appear to be running." }
  }
}
```

## Manual Testing

### Test Upload Endpoint
```bash
curl -X POST http://your-server/api/import/cv/upload \
  -H "Cookie: your-auth-cookie" \
  -F "file=@/path/to/test-cv.pdf"
```

### Check Job Status
```bash
curl http://your-server/api/import/cv/status/JOB_ID \
  -H "Cookie: your-auth-cookie"
```

### View Queue Status
```bash
# Connect to Redis CLI
docker-compose exec redis redis-cli

# List all jobs
KEYS bull:cv-processing:*

# Check waiting jobs
LLEN bull:cv-processing:wait
```

## Recent Improvements

### Enhanced Error Handling
- Worker now validates connections on startup
- Better error messages in upload endpoint
- Graceful shutdown handling in worker

### Better Logging
- Worker logs include job duration and detailed errors
- Upload endpoint logs file validation and queue errors
- Health check endpoint for system diagnostics

### Frontend Improvements
- Better error messages for users
- File validation before upload
- Increased retry logic for status polling
- Timeout handling (5 minutes)

## Deployment Checklist

When deploying to production, ensure:

1. ✅ **Worker service is running**
   ```bash
   docker-compose up -d worker
   ```

2. ✅ **Redis is accessible**
   - Check `REDIS_URL` environment variable
   - Verify Redis container is running

3. ✅ **Database is accessible**
   - Check `DATABASE_URL` environment variable
   - Run migrations: `npx prisma migrate deploy`

4. ✅ **AI API keys are set**
   - At least one of: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`

5. ✅ **Worker logs are monitored**
   ```bash
   docker-compose logs -f worker
   ```

## Monitoring

### Key Metrics to Watch
- **Queue depth**: Number of waiting jobs (should stay low)
- **Failed jobs**: Check `docker-compose logs worker | grep failed`
- **Processing time**: Should be < 2 minutes for typical CVs
- **Worker restarts**: Check `docker-compose ps worker` for restart count

### Log Locations
- **Worker logs**: `docker-compose logs worker`
- **App logs**: `docker-compose logs app`
- **Redis logs**: `docker-compose logs redis`
- **Database logs**: `docker-compose logs db`

## Quick Fixes

### Restart Everything
```bash
docker-compose restart
```

### Restart Just Worker
```bash
docker-compose restart worker
```

### Clear Stuck Jobs
```bash
# Connect to Redis
docker-compose exec redis redis-cli

# Clear all queue keys (use with caution!)
KEYS bull:cv-processing:*
# Then delete specific keys if needed
```

### View Recent Errors
```bash
docker-compose logs --tail=100 worker | grep -i error
docker-compose logs --tail=100 app | grep -i "upload\|cv"
```



