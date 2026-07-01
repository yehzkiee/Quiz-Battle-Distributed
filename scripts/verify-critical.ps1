$ErrorActionPreference = "Continue"

function Pass($name) { Write-Host "[OK] $name" -ForegroundColor Green }
function Fail($name, $detail = "") { Write-Host "[FAIL] $name $detail" -ForegroundColor Red }
function Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }

function Import-LocalEnv($path = ".env") {
  if (-not (Test-Path $path)) { return }
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $parts = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
  }
}

function Test-Get($name, $url, $token = $null) {
  try {
    $headers = @{}
    if ($token) { $headers.Authorization = "Bearer $token" }
    $result = Invoke-RestMethod $url -Headers $headers -TimeoutSec 10
    Pass $name
    return $result
  } catch {
    Fail $name $_.Exception.Message
    return $null
  }
}

function Test-Post($name, $url, $body, $token = $null) {
  try {
    $headers = @{}
    if ($token) { $headers.Authorization = "Bearer $token" }
    $result = Invoke-RestMethod -Method Post -Uri $url -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers $headers -TimeoutSec 15
    Pass $name
    return $result
  } catch {
    Fail $name $_.Exception.Message
    return $null
  }
}

Import-LocalEnv

Info "Checking public gateway and core services"
Test-Get "Nginx/frontend gateway" "http://localhost" | Out-Null
Test-Get "Auth health" "http://localhost/api/auth/health" | Out-Null
Test-Get "User health through Nginx LB" "http://localhost/api/users/health" | Out-Null
Test-Get "Questions health" "http://localhost/api/questions/health" | Out-Null
$randomQuestions = Test-Get "Random questions endpoint" "http://localhost/api/questions?random=true&limit=5"
if ($randomQuestions -and $randomQuestions.Count -le 5) { Pass "Random questions limit respected" } else { Fail "Random questions limit respected" }
Test-Get "Ranking health" "http://localhost/api/ranking/health" | Out-Null
Test-Get "Saga health" "http://localhost/api/saga/health" | Out-Null

Info "Checking auth and role tokens"
$suffix = Get-Random -Minimum 1000 -Maximum 9999
$user = Test-Post "Register normal user" "http://localhost/api/auth/register" @{ username = "verify_user_$suffix"; password = "verify-local-password" }
if ($user -and $user.user.role -eq "user") { Pass "Registered account default role=user" } else { Fail "Registered account default role=user" }
if ($user) {
  Test-Post "Clear stale matchmaking status" "http://localhost/api/matchmaking/clear" @{ userId = $user.user.id } | Out-Null
  Test-Post "Join matchmaking queue" "http://localhost/api/matchmaking/join" @{ userId = $user.user.id } | Out-Null
  Test-Post "Leave matchmaking queue" "http://localhost/api/matchmaking/leave" @{ userId = $user.user.id } | Out-Null
}

$adminUsername = if ($env:DEFAULT_ADMIN_USERNAME) { $env:DEFAULT_ADMIN_USERNAME } else { "admin" }
$instructorUsername = if ($env:DEFAULT_INSTRUCTOR_USERNAME) { $env:DEFAULT_INSTRUCTOR_USERNAME } else { "instructor" }
$admin = $null
$instructor = $null

if ($env:DEFAULT_ADMIN_PASSWORD) {
  $admin = Test-Post "Login default admin" "http://localhost/api/auth/login" @{ username = $adminUsername; password = $env:DEFAULT_ADMIN_PASSWORD }
} else {
  Fail "Login default admin" "DEFAULT_ADMIN_PASSWORD is not set"
}

if ($env:DEFAULT_INSTRUCTOR_PASSWORD) {
  $instructor = Test-Post "Login default instructor" "http://localhost/api/auth/login" @{ username = $instructorUsername; password = $env:DEFAULT_INSTRUCTOR_PASSWORD }
} else {
  Fail "Login default instructor" "DEFAULT_INSTRUCTOR_PASSWORD is not set"
}

Info "Checking admin/instructor question management"
if ($admin) {
  $question = Test-Post "Admin creates multiple-choice question" "http://localhost/api/questions" @{
    question_text = "Verify question $suffix"
    option_a = "One"
    option_b = "Two"
    option_c = "Three"
    option_d = "Four"
    correct_option = "C"
    points = 7
    difficulty = "normal"
  } $admin.token

  if ($question -and $question.correct_option -eq "C" -and $question.points -eq 7) { Pass "Question stores correct option and points" } else { Fail "Question stores correct option and points" }
  Test-Get "Admin can list users" "http://localhost/api/users" $admin.token | Out-Null
}

if ($instructor) {
  Test-Post "Instructor can create question" "http://localhost/api/questions" @{
    question_text = "Instructor verify $suffix"
    option_a = "A"
    option_b = "B"
    option_c = "C"
    option_d = "D"
    correct_option = "A"
    points = 5
    difficulty = "easy"
  } $instructor.token | Out-Null
}

Info "Checking leaderboard and Saga"
if ($user) {
  Test-Post "Saga match-finished updates points" "http://localhost/api/saga/match-finished" @{ userId = $user.user.id; username = $user.user.username; points = 10 } | Out-Null
  Test-Get "Leaderboard read" "http://localhost/api/ranking" | Out-Null
}

Info "Checking Docker-level critical containers"
docker compose ps

Info "Checking replication/PGPool indicators"
if (-not $env:POSTGRES_PASSWORD) {
  Fail "PostgreSQL replication check" "POSTGRES_PASSWORD is not set"
} else {
  docker compose exec -T postgresql-primary env PGPASSWORD=$env:POSTGRES_PASSWORD psql -U postgres -d quiz_db -c 'select application_name, state, sync_state from pg_stat_replication;'
  docker compose exec -T postgresql-standby env PGPASSWORD=$env:POSTGRES_PASSWORD psql -U postgres -d quiz_db -c 'select pg_is_in_recovery();'
}
docker compose logs --tail=80 pgpool
