<#
Dauerhaft laufende Bruecke zur OneNote-COM-Schnittstelle.
Liest pro Zeile eine JSON-Anfrage von stdin, z. B. {"rid":1,"m":"GetHierarchy","start":"","scope":4},
und antwortet pro Zeile mit {"rid":1,"ok":true,"data":"<base64 UTF-8>"}.
Beide Richtungen sind reines ASCII, damit Konsolen-Codepages keine Rolle spielen.
Die gesamte Logik liegt in lib/onenote.mjs, hier passieren nur die rohen COM-Aufrufe.
#>
$ErrorActionPreference = 'Stop'
$script:on = New-Object -ComObject OneNote.Application

function Invoke-Com($req) {
  switch ($req.m) {
    'GetHierarchy' { $x = ''; $script:on.GetHierarchy([string]$req.start, [int]$req.scope, [ref]$x); return $x }
    'GetPageContent' { $x = ''; $script:on.GetPageContent([string]$req.id, [ref]$x, 0); return $x }
    'FindPages' { $x = ''; $script:on.FindPages([string]$req.start, [string]$req.query, [ref]$x); return $x }
    'CreatePage' { $n = ''; $script:on.CreatePage([string]$req.id, [ref]$n, 0); return $n }
    'UpdatePageContent' { $script:on.UpdatePageContent([string]$req.xml); return '' }
    default { throw "Unbekannte Methode: $($req.m)" }
  }
}

function Get-HResult($err) {
  $e = $err.Exception
  while ($e.InnerException) { $e = $e.InnerException }
  return @{ Code = $e.HResult; Message = $e.Message }
}

function Send-Reply($id, [bool]$ok, [string]$text) {
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))
  $okText = if ($ok) { 'true' } else { 'false' }
  [Console]::Out.WriteLine('{"rid":' + [int]$id + ',"ok":' + $okText + ',"data":"' + $b64 + '"}')
  [Console]::Out.Flush()
}

# RPC-Fehler: OneNote wurde beendet oder neu gestartet -> COM-Objekt neu holen und einmal wiederholen.
$rpcErrors = @(0x800706BA, 0x800706BE, 0x80010108) | ForEach-Object { [int]$_ }

while ($null -ne ($line = [Console]::In.ReadLine())) {
  if (-not $line.Trim()) { continue }
  $req = $null
  try {
    $req = ConvertFrom-Json $line
    try {
      $result = Invoke-Com $req
    } catch {
      if ((Get-HResult $_).Code -notin $rpcErrors) { throw }
      $script:on = New-Object -ComObject OneNote.Application
      $result = Invoke-Com $req
    }
    Send-Reply $req.rid $true $result
  } catch {
    $h = Get-HResult $_
    $id = if ($req) { $req.rid } else { 0 }
    Send-Reply $id $false ('0x{0:X8}: {1}' -f $h.Code, $h.Message)
  }
}
