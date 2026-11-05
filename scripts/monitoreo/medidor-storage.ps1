param(
  [ValidateRange(1, 168)][int]$Horas = 24,
  [switch]$SoloMetricas
)

$ErrorActionPreference = 'Stop'
$gcloud = 'C:\Users\Yanpo\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
if (-not (Test-Path -LiteralPath $gcloud)) { $gcloud = 'gcloud' }
$token = (& $gcloud auth print-access-token 2>$null | Select-Object -First 1)
if (-not $token) { throw 'No se pudo obtener la sesion de Google Cloud. Ejecuta gcloud auth login.' }
$headers = @{ Authorization = "Bearer $token" }
$projects = @(
  @{ Project = 'yaxselldemo'; Bucket = 'yaxselldemo.firebasestorage.app'; LogBucket = 'yaxselldemo-storage-audit-749105543407'; Prefix = 'access/yaxsell' },
  @{ Project = 'asistoraerp'; Bucket = 'asistoraerp.firebasestorage.app'; LogBucket = 'asistoraerp-storage-audit-386824737987'; Prefix = 'access/asistora' }
)

# Use complete UTC hours and allow 10 minutes for metric ingestion.
$utcNow = [DateTime]::UtcNow.AddMinutes(-10)
$end = [DateTime]::new($utcNow.Year, $utcNow.Month, $utcNow.Day, $utcNow.Hour, 0, 0, [DateTimeKind]::Utc)
$start = $end.AddHours(-$Horas)
$startIso = $start.ToString("yyyy-MM-ddTHH:mm:ssZ")
$endIso = $end.ToString("yyyy-MM-ddTHH:mm:ssZ")
$summaries = @()

foreach ($project in $projects) {
  $values = @{}
  foreach ($metric in @('storage.googleapis.com/network/sent_bytes_count', 'storage.googleapis.com/api/request_count')) {
    $filter = 'resource.type="gcs_bucket" AND resource.labels.bucket_name="' + $project.Bucket + '" AND metric.type="' + $metric + '" AND metric.labels.method="ReadObject"'
    $encoded = [uri]::EscapeDataString($filter)
    $uri = "https://monitoring.googleapis.com/v3/projects/$($project.Project)/timeSeries?filter=$encoded&interval.startTime=$startIso&interval.endTime=$endIso&aggregation.alignmentPeriod=3600s&aggregation.perSeriesAligner=ALIGN_SUM&pageSize=1000"
    $total = 0.0
    do {
      $data = Invoke-RestMethod -Headers $headers -Uri $uri
      foreach ($series in $data.timeSeries) {
        foreach ($point in $series.points) {
          if ($null -ne $point.value.int64Value) { $total += [double]$point.value.int64Value }
          elseif ($null -ne $point.value.doubleValue) { $total += [double]$point.value.doubleValue }
        }
      }
      $uri = if ($data.nextPageToken) { ($uri -replace '&pageToken=[^&]*', '') + '&pageToken=' + [uri]::EscapeDataString($data.nextPageToken) } else { $null }
    } while ($uri)
    $values[$metric] = $total
  }
  $summaries += [pscustomobject]@{
    Proyecto = $project.Project
    GiB = [math]::Round($values['storage.googleapis.com/network/sent_bytes_count'] / 1GB, 2)
    Lecturas = [long]$values['storage.googleapis.com/api/request_count']
  }
}

Write-Host "`nConsumo de lectura: ultimas $Horas horas completas, hasta $($end.ToLocalTime().ToString('yyyy-MM-dd HH:mm')) hora local"
$summaries | Format-Table -AutoSize
Write-Host 'Los bytes son trafico medido por Monitoring, no una factura ni el saldo exacto de cuota gratuita.'

if (-not $SoloMetricas) {
  foreach ($project in $projects) {
    Write-Host "`nArchivos descargados: $($project.Project)"
    $prefix = [uri]::EscapeDataString($project.Prefix + '_usage_')
    $uri = "https://storage.googleapis.com/storage/v1/b/$($project.LogBucket)/o?prefix=$prefix&maxResults=1000&fields=items(name,updated),nextPageToken"
    $files = @()
    do {
      $listing = Invoke-RestMethod -Headers $headers -Uri $uri
      $files += @($listing.items | Where-Object {
        if (-not $_ -or $_.name -notmatch '_usage_(\d{4})_(\d{2})_(\d{2})_(\d{2})_') { return $false }
        $hour = [datetime]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3], [int]$Matches[4], 0, 0, [DateTimeKind]::Utc)
        # A log can contain requests from an earlier hour than its filename.
        $hour -ge $start
      })
      $uri = if ($listing.nextPageToken) { ($uri -replace '&pageToken=[^&]*', '') + '&pageToken=' + [uri]::EscapeDataString($listing.nextPageToken) } else { $null }
    } while ($uri)
    if ($files.Count -eq 0) { Write-Host 'Aun no hay archivos de registro para este periodo; Google puede tardar varias horas.'; continue }
    $totals = @{}
    $seen = [System.Collections.Generic.HashSet[string]]::new()
    $logBucket = $project.LogBucket
    $rows = $files | ForEach-Object -ThrottleLimit 12 -Parallel {
      $name = [uri]::EscapeDataString($_.name)
      $body = Invoke-RestMethod -Headers $using:headers -Uri "https://storage.googleapis.com/storage/v1/b/$using:logBucket/o/$name`?alt=media" -ErrorAction Stop
      $body | ConvertFrom-Csv | Select-Object cs_method, cs_object, sc_status, sc_bytes, s_request_id, time_micros
    }
    foreach ($row in $rows) {
        if ($row.cs_method -ne 'GET' -or -not $row.cs_object -or [int]$row.sc_status -lt 200 -or [int]$row.sc_status -ge 400) { continue }
        if ($row.s_request_id -and -not $seen.Add($row.s_request_id)) { continue }
        if ($row.time_micros -and [long]$row.time_micros -lt ([DateTimeOffset]$start).ToUnixTimeMilliseconds() * 1000) { continue }
        if ($row.time_micros -and [long]$row.time_micros -ge ([DateTimeOffset]$end).ToUnixTimeMilliseconds() * 1000) { continue }
        $object = ($row.cs_object -split '\?', 2)[0]
        if (-not $totals.ContainsKey($object)) { $totals[$object] = @{ Bytes = 0.0; Requests = 0 } }
        $totals[$object].Bytes += [double]$row.sc_bytes
        $totals[$object].Requests++
    }
    if ($totals.Count -eq 0) { Write-Host 'Los registros recibidos aun no contienen lecturas de objetos para este periodo.'; continue }
    $totals.GetEnumerator() | Sort-Object { $_.Value.Bytes } -Descending | Select-Object -First 15 | ForEach-Object {
      [pscustomobject]@{ Archivo = $_.Key; MiB = [math]::Round($_.Value.Bytes / 1MB, 2); Lecturas = $_.Value.Requests }
    } | Format-Table -AutoSize
  }
}
