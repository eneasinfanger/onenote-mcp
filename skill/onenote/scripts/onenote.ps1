<#
OneNote desktop helper (COM API). Usage:
  onenote.ps1 tree                         Notebooks / groups / sections with page counts
  onenote.ps1 sections [-Filter text]      Sections with full path and ID
  onenote.ps1 pages -Id <sectionId>        Pages of a section (title | modified | ID)
  onenote.ps1 read -Id <pageId>            Page content as plain text
  onenote.ps1 search -Query text [-Id <notebook/section ID>]   Pages containing text
  onenote.ps1 create -Id <sectionId> -Title text [-Body text | -BodyFile path]
#>
param(
  [Parameter(Position = 0, Mandatory = $true)]
  [ValidateSet('tree', 'sections', 'pages', 'read', 'search', 'create')]
  [string]$Command,
  [string]$Id = '',
  [string]$Filter = '',
  [string]$Query = '',
  [string]$Title = '',
  [string]$Body = '',
  [string]$BodyFile = ''
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$NS = 'http://schemas.microsoft.com/office/onenote/2013/onenote'
# HierarchyScope: 0 self, 1 children, 2 notebooks, 3 sections, 4 pages
$on = New-Object -ComObject OneNote.Application

function Get-Hierarchy([string]$startId, [int]$scope) {
  $x = ''
  $on.GetHierarchy($startId, $scope, [ref]$x)
  [xml]$doc = $x
  $m = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
  $m.AddNamespace('one', $NS)
  return @{ Doc = $doc; Ns = $m }
}

function Skip-Node($n) { $n.isRecycleBin -eq 'true' -or $n.isInRecycleBin -eq 'true' }

function Get-NodePath($n) {
  $parts = @()
  while ($n -and $n.LocalName -in 'Section', 'SectionGroup', 'Notebook', 'Page') {
    $parts = , $n.name + $parts
    $n = $n.ParentNode
  }
  ($parts -join ' / ')
}

function Convert-HtmlToText([string]$s) {
  $s = $s -replace '<br\s*/?>', "`n"
  $s = $s -replace '<[^>]+>', ''
  [System.Net.WebUtility]::HtmlDecode($s)
}

function Write-Outline($node, $m, [int]$depth) {
  foreach ($oe in $node.SelectNodes('one:OE', $m)) {
    $pad = '  ' * $depth
    $t = $oe.SelectSingleNode('one:T', $m)
    if ($t) {
      $bullet = if ($oe.SelectSingleNode('one:List', $m)) { '- ' } else { '' }
      $text = Convert-HtmlToText $t.InnerText
      if ($text.Trim()) { "$pad$bullet$text" }
    }
    $tbl = $oe.SelectSingleNode('one:Table', $m)
    if ($tbl) {
      foreach ($row in $tbl.SelectNodes('one:Row', $m)) {
        $cells = foreach ($c in $row.SelectNodes('one:Cell', $m)) {
          ((@($c.SelectNodes('.//one:T', $m)) | ForEach-Object { Convert-HtmlToText $_.InnerText }) -join ' ').Trim()
        }
        "$pad| " + ($cells -join ' | ') + ' |'
      }
    }
    if ($oe.SelectSingleNode('one:Image', $m)) { "$pad[Bild]" }
    if ($oe.SelectSingleNode('one:InkDrawing|one:InkParagraph|one:InkWord', $m)) { "$pad[Freihand]" }
    $file = $oe.SelectSingleNode('one:InsertedFile', $m)
    if ($file) { "$pad[Datei: $($file.preferredName)]" }
    $kids = $oe.SelectSingleNode('one:OEChildren', $m)
    if ($kids) { Write-Outline $kids $m ($depth + 1) }
  }
}

switch ($Command) {
  'tree' {
    $h = Get-Hierarchy '' 4
    function Show-Tree($node, [string]$indent) {
      foreach ($c in $node.ChildNodes) {
        if (Skip-Node $c) { continue }
        if ($c.LocalName -eq 'SectionGroup') { "$indent[Gruppe] $($c.name)"; Show-Tree $c ($indent + '    ') }
        elseif ($c.LocalName -eq 'Section') { "$indent- $($c.name) ($(@($c.SelectNodes('one:Page', $h.Ns)).Count) Seiten)" }
      }
    }
    foreach ($nb in $h.Doc.SelectNodes('/one:Notebooks/one:Notebook', $h.Ns)) {
      "[Notizbuch] $($nb.name)"
      Show-Tree $nb '    '
    }
  }

  'sections' {
    $h = Get-Hierarchy '' 3
    foreach ($s in $h.Doc.SelectNodes('//one:Section', $h.Ns)) {
      if (Skip-Node $s) { continue }
      $p = Get-NodePath $s
      if (-not $Filter -or $p -like "*$Filter*") { "$p | $($s.ID)" }
    }
  }

  'pages' {
    if (-not $Id) { throw 'pages needs -Id <sectionId>' }
    $h = Get-Hierarchy $Id 4
    foreach ($p in $h.Doc.SelectNodes('//one:Page', $h.Ns)) {
      if (Skip-Node $p) { continue }
      $pad = '  ' * ([int]$p.pageLevel - 1)
      $date = ([datetime]$p.lastModifiedTime).ToString('yyyy-MM-dd')
      "$pad$($p.name) | $date | $($p.ID)"
    }
  }

  'read' {
    if (-not $Id) { throw 'read needs -Id <pageId>' }
    $x = ''
    $on.GetPageContent($Id, [ref]$x, 0)
    [xml]$doc = $x
    $m = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
    $m.AddNamespace('one', $NS)
    $page = $doc.DocumentElement
    "# $($page.name)"
    "(zuletzt geaendert: $(([datetime]$page.lastModifiedTime).ToString('yyyy-MM-dd HH:mm')))"
    foreach ($o in $doc.SelectNodes('/one:Page/one:Outline', $m)) {
      ''
      $kids = $o.SelectSingleNode('one:OEChildren', $m)
      if ($kids) { Write-Outline $kids $m 0 }
    }
  }

  'search' {
    if (-not $Query) { throw 'search needs -Query text' }
    $x = ''
    $on.FindPages($Id, $Query, [ref]$x)
    [xml]$doc = $x
    $m = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
    $m.AddNamespace('one', $NS)
    $hits = @($doc.SelectNodes('//one:Page', $m) | Where-Object { -not (Skip-Node $_) })
    foreach ($p in $hits) { "$(Get-NodePath $p) | $($p.ID)" }
    if ($hits.Count -eq 0) { 'Keine Treffer.' }
  }

  'create' {
    if (-not $Id -or -not $Title) { throw 'create needs -Id <sectionId> -Title text' }
    if ($BodyFile) { $Body = [System.IO.File]::ReadAllText($BodyFile, [System.Text.Encoding]::UTF8) }
    $newId = ''
    $on.CreatePage($Id, [ref]$newId, 0)
    $cdata = { param($s) '<![CDATA[' + ($s -replace '\]\]>', ']]]]><![CDATA[>') + ']]>' }
    $sec = [System.Security.SecurityElement]
    $paras = foreach ($line in ($Body -split "`r?`n")) { "<one:OE><one:T>$(& $cdata $line)</one:T></one:OE>" }
    $pageXml = @"
<?xml version="1.0"?>
<one:Page xmlns:one="$NS" ID="$($sec::Escape($newId))">
  <one:Title><one:OE><one:T>$(& $cdata $Title)</one:T></one:OE></one:Title>
  <one:Outline><one:OEChildren>$($paras -join '')</one:OEChildren></one:Outline>
</one:Page>
"@
    $on.UpdatePageContent($pageXml)
    "Seite erstellt: $Title | $newId"
  }
}
