---
description: Deploy CV Creator to production server (cv.staycurrentai.com)
---

# CV Creator Deployment Workflow

// turbo-all

## Prerequisites
- SSH key: `/Users/toddponskymd/Desktop/Cursor Projects/AWS/EmpowerAI.pem`
- Server: `ec2-user@3.14.156.143`
- App location: `/home/ec2-user/cv-creator`

## Deployment Steps

1. Ensure local changes are committed to git:
```bash
cd "/Users/toddponskymd/Desktop/Cursor Projects/CV creator"
git status
git add . && git commit -m "Your commit message" && git push origin main
```

2. SSH into server and pull latest code:
```bash
ssh -i "/Users/toddponskymd/Desktop/Cursor Projects/AWS/EmpowerAI.pem" ec2-user@3.14.156.143 "cd cv-creator && git pull origin main"
```

3. Rebuild and restart Docker containers:
```bash
ssh -i "/Users/toddponskymd/Desktop/Cursor Projects/AWS/EmpowerAI.pem" ec2-user@3.14.156.143 "cd cv-creator && docker-compose build --no-cache && docker-compose up -d"
```

4. Verify deployment:
```bash
ssh -i "/Users/toddponskymd/Desktop/Cursor Projects/AWS/EmpowerAI.pem" ec2-user@3.14.156.143 "docker ps --filter name=cv-creator"
```

5. Check logs if needed:
```bash
ssh -i "/Users/toddponskymd/Desktop/Cursor Projects/AWS/EmpowerAI.pem" ec2-user@3.14.156.143 "cd cv-creator && docker-compose logs --tail=50 app"
```

## Quick One-Liner Deploy
```bash
ssh -i "/Users/toddponskymd/Desktop/Cursor Projects/AWS/EmpowerAI.pem" ec2-user@3.14.156.143 "cd cv-creator && git pull origin main && docker-compose build --no-cache && docker-compose up -d"
```

## Server Details
- **URL**: https://cv.staycurrentai.com
- **Port**: 3001 (mapped to 3000 inside container)
- **Database**: PostgreSQL running in Docker (cv-creator-db-1)
- **App Container**: cv-creator-app-1
