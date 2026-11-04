param(
  [string]$OutDir = "backups",
  [string]$Container = "gis-tataruang-db",
  [string]$Database = "gis_tataruang",
  [string]$User = "gis"
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = "gis_$stamp.dump"
$resolved = Join-Path (Resolve-Path ".").Path $OutDir

New-Item -ItemType Directory -Force -Path $resolved | Out-Null

Write-Host "Membuat cadangan basis data $Database..."
docker exec $Container pg_dump -U $User -d $Database -Fc -f "/tmp/$file"
docker cp "${Container}:/tmp/$file" (Join-Path $resolved $file)
docker exec $Container rm "/tmp/$file"

$size = (Get-Item (Join-Path $resolved $file)).Length
Write-Host "Cadangan tersimpan: $(Join-Path $resolved $file) ($([math]::Round($size / 1MB, 2)) MB)"
Write-Host "Pulihkan dengan: docker exec -i $Container pg_restore -U $User -d $Database --clean --if-exists < $file"
