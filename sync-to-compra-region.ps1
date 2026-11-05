<#
.SYNOPSIS
  Sync web-store changes from YAXSEL -> COMPRA REGION - YAXSELL
  Copies changed files and auto-converts pink/rose palette -> orange palette
  Only syncs changes from NOW forward (timestamp-based)

.USAGE
  Option 1 - Watch mode (continuous polling, every 3 seconds):
    .\sync-to-compra-region.ps1 -Watch

  Option 2 - One-shot sync (sync all files changed since timestamp):
    .\sync-to-compra-region.ps1 -Since (Get-Date).AddMinutes(-5)

  Option 3 - Sync a single file:
    .\sync-to-compra-region.ps1 -File "src\templates\plantilla1\Navbar.tsx"

  Option 4 - Initial full sync (sync everything now):
    .\sync-to-compra-region.ps1 -Full
#>

param(
  [switch]$Watch,
  [datetime]$Since,
  [string]$File,
  [switch]$Full
)

$ErrorActionPreference = 'Stop'

# -- Paths --
$SRC_ROOT  = 'C:\Proyectos\PROJECT YAXSEL\web-store'
$DST_ROOT  = 'C:\Proyectos\COMPRA REGION - YAXSELL\web-store'

# -- Timestamp file (marks "from now on") --
$TS_FILE   = Join-Path $SRC_ROOT '.sync-timestamp'

# -- Excluded paths (relative to root) --
$EXCLUDE_DIRS  = @('node_modules', '.next', '.git', '.vercel', 'plan migratorio', 'Analisis Low Level')
$EXCLUDE_FILES = @(
  '.env.local',
  'package-lock.json',
  'tsconfig.tsbuildinfo',
  'coast.png',
  '.sync-timestamp',
  '.sync-log.txt',
  'sync-to-compra-region.ps1'
)

# -- Appwrite credential files -- preserve destination IDs --
$CRED_FILES = @(
  'src\lib\appwrite-server.ts',
  'src\lib\appwrite-admin.ts'
)

# -- Color replacement pairs (ordered array, longer strings first) --
# PowerShell hashtables are case-insensitive, so we use an array of PSCustomObject
$COLOR_MAP = @(
  # RGBA values (longest first)
  [PSCustomObject]@{ Old = 'rgba(227,150,191'; New = 'rgba(241,142,4'  },
  [PSCustomObject]@{ Old = 'rgba(236,72,153';  New = 'rgba(234,88,12'  },
  [PSCustomObject]@{ Old = 'rgba(244,114,182'; New = 'rgba(249,115,22' },
  [PSCustomObject]@{ Old = 'rgba(249,168,212'; New = 'rgba(249,115,22' },
  # const PINK (before hex to avoid partial match)
  [PSCustomObject]@{ Old = "const ORANGE_PRIMARY = '#ec4899'"; New = "const ORANGE_PRIMARY = '#ea580c'" },
  [PSCustomObject]@{ Old = "const PINK_LIGHT = '#f472b6'"; New = "const PINK_LIGHT = '#f97316'" },
  # Tailwind class replacements (before hex)
  [PSCustomObject]@{ Old = 'from-pink-500 to-rose-400'; New = 'from-orange-500 to-amber-400' },
  [PSCustomObject]@{ Old = 'from-pink-500 to-rose-500'; New = 'from-orange-500 to-amber-500' },
  [PSCustomObject]@{ Old = 'hover:border-pink-200';     New = 'hover:border-orange-200' },
  [PSCustomObject]@{ Old = 'hover:bg-pink-50';          New = 'hover:bg-orange-50' },
  [PSCustomObject]@{ Old = 'shadow-pink-200';           New = 'shadow-orange-200' },
  [PSCustomObject]@{ Old = 'shadow-pink-100';           New = 'shadow-orange-100' },
  [PSCustomObject]@{ Old = 'bg-pink-50/30';             New = 'bg-orange-50/30' },
  [PSCustomObject]@{ Old = 'bg-pink-50/10';             New = 'bg-orange-50/10' },
  [PSCustomObject]@{ Old = 'bg-pink-50/50';             New = 'bg-orange-50/50' },
  [PSCustomObject]@{ Old = 'border-pink-500';           New = 'border-orange-500' },
  [PSCustomObject]@{ Old = 'border-pink-200';           New = 'border-orange-200' },
  [PSCustomObject]@{ Old = 'border-pink-100';           New = 'border-orange-100' },
  [PSCustomObject]@{ Old = 'text-pink-500';             New = 'text-orange-500' },
  [PSCustomObject]@{ Old = 'text-pink-400';             New = 'text-orange-400' },
  [PSCustomObject]@{ Old = 'bg-pink-500';               New = 'bg-orange-500' },
  [PSCustomObject]@{ Old = 'bg-pink-100';               New = 'bg-orange-100' },
  # Hex values - lowercase
  [PSCustomObject]@{ Old = '#c0547a'; New = '#b45309' },
  [PSCustomObject]@{ Old = '#c084a0'; New = '#9a3412' },
  [PSCustomObject]@{ Old = '#ec4899'; New = '#ea580c' },
  [PSCustomObject]@{ Old = '#be185d'; New = '#9a3412' },
  [PSCustomObject]@{ Old = '#f472b6'; New = '#f97316' },
  [PSCustomObject]@{ Old = '#e396bf'; New = '#f18e04' },
  [PSCustomObject]@{ Old = '#f5a8cf'; New = '#f29718' },
  [PSCustomObject]@{ Old = '#fdf2f8'; New = '#fff7ed' },
  [PSCustomObject]@{ Old = '#fce7f3'; New = '#ffedd5' }
)

# -- Appwrite credential preservation (YAXSEL IDs -> COMPRA REGION IDs) --
$CRED_MAP = @(
  [PSCustomObject]@{ Old = '6a0a4e8d0032177f3f90'; New = '6a0e374b0009138bc6fa' },
  [PSCustomObject]@{ Old = '6a0a58ca001798410d86'; New = '6a0e37ac0016762b9dc4' }
)

# -- Log file --
$LOG_FILE = Join-Path $SRC_ROOT '.sync-log.txt'

function Write-Log($msg) {
  $ts = Get-Date -Format 'HH:mm:ss'
  $line = "[$ts] $msg"
  Write-Host $line
  Add-Content -Path $LOG_FILE -Value $line -ErrorAction SilentlyContinue
}

function Test-Excluded($relativePath) {
  foreach ($dir in $EXCLUDE_DIRS) {
    if ($relativePath.StartsWith("$dir\")) { return $true }
  }
  $fileName = Split-Path $relativePath -Leaf
  foreach ($ex in $EXCLUDE_FILES) {
    if ($fileName -eq $ex) { return $true }
  }
  return $false
}

function Test-CredFile($relativePath) {
  $normalized = $relativePath.Replace('/', '\')
  foreach ($cf in $CRED_FILES) {
    if ($normalized -eq $cf) { return $true }
  }
  return $false
}

function Convert-Content([string]$content, [bool]$isCredFile) {
  # Apply color conversions
  foreach ($pair in $COLOR_MAP) {
    $content = $content.Replace($pair.Old, $pair.New)
  }
  # Apply credential preservation for cred files
  if ($isCredFile) {
    foreach ($pair in $CRED_MAP) {
      $content = $content.Replace($pair.Old, $pair.New)
    }
  }
  return $content
}

function Sync-File($relativePath) {
  if (Test-Excluded $relativePath) { return }

  $srcFile = Join-Path $SRC_ROOT $relativePath
  $dstFile = Join-Path $DST_ROOT $relativePath

  if (-not (Test-Path $srcFile)) { return }

  # Read source content
  $content = [System.IO.File]::ReadAllText($srcFile)

  # Apply conversions
  $isCred = Test-CredFile $relativePath
  $content = Convert-Content $content $isCred

  # Ensure destination directory exists
  $dstDir = Split-Path $dstFile -Parent
  if (-not (Test-Path $dstDir)) {
    New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
  }

  # Write to destination (only if different)
  if (Test-Path $dstFile) {
    $existing = [System.IO.File]::ReadAllText($dstFile)
    if ($existing -eq $content) { return }
  }

  [System.IO.File]::WriteAllText($dstFile, $content)
  Write-Log "SYNCED: $relativePath"
}

function Set-SyncTimestamp {
  $now = Get-Date
  Set-Content -Path $TS_FILE -Value $now.ToString('o') -NoNewline
  Write-Log "TIMESTAMP SET: $now - only changes after this will be synced"
}

function Get-SyncTimestamp {
  if (Test-Path $TS_FILE) {
    return [datetime]::Parse((Get-Content $TS_FILE -Raw).Trim())
  }
  return $null
}

# ================================================================
# MAIN
# ================================================================

Write-Log "=== SYNC START ==="
Write-Log "Source:      $SRC_ROOT"
Write-Log "Destination: $DST_ROOT"

# -- Single file mode --
if ($File) {
  Write-Log "MODE: Single file"
  Sync-File $File
  Write-Log "=== SYNC END ==="
  exit 0
}

# -- Set timestamp if first run --
$ts = Get-SyncTimestamp
if (-not $ts) {
  Set-SyncTimestamp
  $ts = Get-Date
  Write-Log "First run - timestamp set to NOW. No past files will be synced."
}

# -- Full sync mode --
if ($Full) {
  Write-Log "MODE: Full sync"
  $count = 0
  $files = Get-ChildItem -Path $SRC_ROOT -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring($SRC_ROOT.Length + 1)
    -not (Test-Excluded $rel)
  }
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($SRC_ROOT.Length + 1)
    Sync-File $rel
    $count++
  }
  Write-Log "=== SYNC END ($count files scanned) ==="
  exit 0
}

# -- Since mode --
if ($Since) {
  Write-Log "MODE: One-shot sync (since $Since)"
  $changedFiles = Get-ChildItem -Path $SRC_ROOT -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring($SRC_ROOT.Length + 1)
    -not (Test-Excluded $rel) -and $_.LastWriteTime -gt $Since
  }
  foreach ($f in $changedFiles) {
    $rel = $f.FullName.Substring($SRC_ROOT.Length + 1)
    Sync-File $rel
  }
  Write-Log "=== SYNC END ($($changedFiles.Count) changed files) ==="
  exit 0
}

# -- Watch mode (polling every 3s) --
if ($Watch) {
  Write-Log "MODE: Watch (polling every 3s)"
  Write-Log "Watching for changes... Press Ctrl+C to stop"
  Write-Log ""

  # Build initial file hash table (relativePath -> LastWriteTime)
  $fileTimes = @{}
  Get-ChildItem -Path $SRC_ROOT -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring($SRC_ROOT.Length + 1)
    -not (Test-Excluded $rel)
  } | ForEach-Object {
    $rel = $_.FullName.Substring($SRC_ROOT.Length + 1)
    $fileTimes[$rel] = $_.LastWriteTime
  }

  Write-Log "Tracking $($fileTimes.Count) files"

  try {
    while ($true) {
      Start-Sleep -Seconds 3

      # Scan for changes
      $currentFiles = Get-ChildItem -Path $SRC_ROOT -Recurse -File | Where-Object {
        $rel = $_.FullName.Substring($SRC_ROOT.Length + 1)
        -not (Test-Excluded $rel)
      }

      foreach ($f in $currentFiles) {
        $rel = $f.FullName.Substring($SRC_ROOT.Length + 1)
        $prevTime = $fileTimes[$rel]

        if (-not $prevTime -or $f.LastWriteTime -gt $prevTime) {
          Sync-File $rel
          $fileTimes[$rel] = $f.LastWriteTime
        }
      }

      # Remove deleted files from tracking
      $currentRels = @($currentFiles | ForEach-Object {
        $_.FullName.Substring($SRC_ROOT.Length + 1)
      })
      $toRemove = @()
      foreach ($key in $fileTimes.Keys) {
        if ($currentRels -notcontains $key) {
          $toRemove += $key
        }
      }
      foreach ($key in $toRemove) {
        $fileTimes.Remove($key)
      }
    }
  } finally {
    Write-Log "=== SYNC STOPPED ==="
  }

  exit 0
}

# -- No mode specified - show help --
Write-Host ""
Write-Host "Usage:" -ForegroundColor Cyan
Write-Host "  .\sync-to-compra-region.ps1 -Watch          # Continuous watch mode (polling)"
Write-Host "  .\sync-to-compra-region.ps1 -Full           # Initial full sync"
Write-Host "  .\sync-to-compra-region.ps1 -Since (Get-Date).AddMinutes(-5)  # Sync recent changes"
Write-Host "  .\sync-to-compra-region.ps1 -File 'src\templates\plantilla1\Navbar.tsx'  # Single file"
Write-Host ""
Write-Host "First run sets a timestamp. Only changes AFTER that timestamp are synced."
Write-Host "Timestamp file: $TS_FILE"
