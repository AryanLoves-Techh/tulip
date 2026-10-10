// KEYS[1] bucket key | ARGV: capacity, refill per sec, cost
// returns { allowed (0/1), remaining, retryAfterMs, resetMs }
export const TOKEN_BUCKET_LUA = `
local capacity = tonumber(ARGV[1])
local refill   = tonumber(ARGV[2])
local cost     = tonumber(ARGV[3])

-- Redis server clock: every API node agrees on "now", even if their own clocks drift
local t   = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local state  = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts     = tonumber(state[2])

if tokens == nil or ts == nil then
  tokens = capacity
  ts = now
end

-- lazy refill
local elapsed = math.max(0, now - ts)
tokens = math.min(capacity, tokens + (elapsed / 1000) * refill)

local allowed = 0
local retry = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retry = math.ceil(((cost - tokens) / refill) * 1000)
end

redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
-- idle buckets vanish after 2x the time needed to fully refill
redis.call('PEXPIRE', KEYS[1], math.ceil((capacity / refill) * 1000) * 2)

local reset = math.ceil(((capacity - tokens) / refill) * 1000)
return { allowed, math.floor(tokens), retry, reset }
`;