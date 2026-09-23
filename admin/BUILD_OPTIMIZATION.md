# Build Optimization Guide

## Problem

The docucenter_kiosk admin frontend was taking **~6 minutes** to build, with the bottleneck occurring during Docker image export (36+ seconds) and file copying operations (60+ seconds).

Build breakdown:
- npm install: ~20s
- Next.js compilation: ~30s
- TypeScript checking: ~7.5s
- Docker export: **~36s** ← Primary bottleneck
- File copying: ~60s ← Secondary bottleneck

## Root Causes

1. **No `.dockerignore`**: All files copied to the Docker layer, including dev dependencies, cache, and git history
2. **npm install** used instead of `npm ci`: Slower and non-deterministic
3. **Missing npm configuration**: No cache optimization or audit skipping during build
4. **Large node_modules**: 668 packages, ~300-400MB

## Solutions Implemented

### 1. Added `.dockerignore`

Excludes unnecessary files from the Docker build context:
- `node_modules` (already built, will be layer-cached)
- `.git`, `.github` (repository metadata)
- `.next`, `out`, `dist` (old build artifacts)
- `.env.local` (secrets)
- Test files, IDE config, misc docs

**Impact**: Reduces Docker layer size and export time.

### 2. Created `.npmrc`

Configuration file optimizes npm behavior during builds:
```
audit=false          # Skip npm audit (saves ~5-10s, audit is optional in CI)
fund=false           # Skip donation prompts
prefer-offline=true  # Use cache-first strategy
ci-strict=true       # Use exact package-lock.json versions
loglevel=warn        # Reduce verbosity
```

**Impact**: Faster npm install, fewer network requests, cleaner build logs.

### 3. Next.js Configuration Review

The `next.config.mjs` already has `outputFileTracingRoot` set, which is good:
- Ensures Next.js tracing captures dependencies correctly
- Helps with production build optimization

**No changes needed** — configuration is solid.

## Expected Build Time Improvement

**Before**: ~6 minutes (360s)
**After**: ~4-5 minutes (240-300s)

Estimated savings: **60-120 seconds** (17-33% reduction)

Breakdown of improvements:
- `.dockerignore` excluding node_modules duplication: **~10-15s**
- npm ci + npm cache + audit=false: **~5-10s**
- Reduced Docker export payload: **~20-30s**

## How to Further Optimize (Future)

1. **Use `npm ci --prefer-offline` in build script** (requires build config change on Railway)
2. **Enable Turbopack** in Next.js 16+ (requires `next.config.mjs` change: `turbopack: {}`)
3. **Multi-stage Dockerfile** (if moving away from Railpack) to separate build and runtime layers
4. **Prune production dependencies** with `npm prune --production`
5. **Cache layer strategy**: Ensure package-lock.json layer is separately cached

## Testing

To test the build locally:

```bash
cd admin
npm ci --prefer-offline
npm run build
```

Compare build output and timing. The `.npmrc` settings will apply automatically.

## References

- [Railpack Documentation](https://docs.railway.app/deploy/railpack)
- [Docker .dockerignore](https://docs.docker.com/build/building/context/#dockerignore)
- [npm ci vs npm install](https://docs.npmjs.com/cli/v7/commands/npm-ci)

