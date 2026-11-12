[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$SiteDirectory,

    [string]$ProjectsJsonPath
)

$ErrorActionPreference = 'Stop'

# Generate only inside the built site, never relative to the working directory.
$siteItem = Get-Item -LiteralPath $SiteDirectory -Force
if (-not $siteItem.PSIsContainer -or $siteItem.PSProvider.Name -ne 'FileSystem') {
    throw 'SiteDirectory must be an existing filesystem directory.'
}
if (($siteItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'SiteDirectory must not be a symbolic link or junction.'
}
$siteRoot = [IO.Path]::GetFullPath($siteItem.FullName)
$templatePath = Join-Path $siteRoot 'project.html'
$caseRoot = [IO.Path]::GetFullPath((Join-Path $siteRoot 'case'))
$sitemapPath = Join-Path $siteRoot 'sitemap.xml'
$pathComparison = if ([IO.Path]::DirectorySeparatorChar -eq '\') {
    [StringComparison]::OrdinalIgnoreCase
} else {
    [StringComparison]::Ordinal
}

function Assert-RegularFile {
    param([string]$Path)

    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Expected a regular file: $Path"
    }
}

function Assert-CaseDirectory {
    # Require exactly the child named case before any recursive removal.
    $parentPath = [IO.Path]::GetDirectoryName($caseRoot)
    if (-not [string]::Equals($parentPath, $siteRoot.TrimEnd([IO.Path]::DirectorySeparatorChar), $pathComparison) -or
        [IO.Path]::GetFileName($caseRoot) -ne 'case') {
        throw 'The case output directory is outside SiteDirectory.'
    }

    if (Test-Path -LiteralPath $caseRoot) {
        $caseItem = Get-Item -LiteralPath $caseRoot -Force
        if (-not $caseItem.PSIsContainer -or
            ($caseItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'The existing case output must be a regular directory.'
        }
        # Refuse links anywhere in the old output instead of following them.
        $linkedItem = Get-ChildItem -LiteralPath $caseRoot -Recurse -Force |
            Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 } |
            Select-Object -First 1
        if ($null -ne $linkedItem) {
            throw "The existing case output contains a symbolic link or junction: $($linkedItem.FullName)"
        }
    }
}

Assert-RegularFile $templatePath
if (Test-Path -LiteralPath $sitemapPath) {
    Assert-RegularFile $sitemapPath
}
Assert-CaseDirectory
$template = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8

$base = 'https://toolsforyourwork.github.io/custom-tools-studio'
$supabaseUrl = 'https://bpdqosfgxqawbzljafgb.supabase.co'
$ogBase = 'https://bpdqosfgxqawbzljafgb.supabase.co/functions/v1/og-image'

if ($ProjectsJsonPath) {
    Assert-RegularFile $ProjectsJsonPath
    $content = Get-Content -LiteralPath $ProjectsJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
    # This is the same public, read-only content source used by the site.
    $key = 'sb_publishable_FQaK_TPRAjA1NMcVG9zqzw_VFvqaRXk'
    $headers = @{ apikey = $key }
    $uri = "$supabaseUrl/functions/v1/public-content?mode=list"
    $content = Invoke-RestMethod -Uri $uri -Headers $headers -TimeoutSec 60
}

if ($null -eq $content -or $null -eq $content.PSObject.Properties['projects'] -or
    $content.projects -isnot [System.Array]) {
    throw 'Expected a JSON object with a projects array; an empty array is allowed.'
}
$projects = @($content.projects)

$urls = @(
    @{ loc = "$base/"; priority = '1.0' },
    @{ loc = "$base/approach.html"; priority = '0.8' },
    @{ loc = "$base/projects.html"; priority = '0.9' },
    @{ loc = "$base/identity.html"; priority = '0.5' },
    @{ loc = "$base/contacts.html"; priority = '0.6' },
    @{ loc = "$base/request.html"; priority = '0.8' },
    @{ loc = "$base/privacy.html"; priority = '0.3' }
)
$lines = [Collections.Generic.List[string]]::new()
$lines.Add('<?xml version="1.0" encoding="UTF-8"?>')
$lines.Add('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
foreach ($item in $urls) {
    $lines.Add("  <url><loc>$($item.loc)</loc><priority>$($item.priority)</priority></url>")
}

$seenSlugs = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$pages = [Collections.Generic.List[object]]::new()

# Validate and render every project before replacing any previous output.
foreach ($project in $projects) {
    $slug = [string]$project.slug
    # The admin creates ASCII hyphenated slugs; underscores remain accepted for legacy content.
    if ($slug -notmatch '\A[A-Za-z0-9][A-Za-z0-9_-]*\z' -or $slug.Length -gt 255 -or
        $slug -match '\A(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\z') {
        throw "Invalid project slug: '$slug'. Use a non-reserved filename containing letters, digits, hyphens or underscores."
    }
    if (-not $seenSlugs.Add($slug)) {
        throw "Duplicate project slug (case-insensitive): '$slug'."
    }
    $caseDir = [IO.Path]::GetFullPath((Join-Path $caseRoot $slug))
    if (-not [string]::Equals([IO.Path]::GetDirectoryName($caseDir), $caseRoot, $pathComparison)) {
        throw "Project slug escapes the case directory: '$slug'."
    }
    if ([string]::IsNullOrWhiteSpace([string]$project.updated_at)) {
        throw "Project '$slug' is missing updated_at."
    }
    $lastmod = ([DateTimeOffset]$project.updated_at).ToString('yyyy-MM-dd')

    $encodedSlug = [System.Uri]::EscapeDataString($slug)
    $caseUrl = "$base/case/$encodedSlug/"
    $title = [string]$project.title
    $description = [string]$project.short_description
    if ([string]::IsNullOrWhiteSpace($description)) {
        $description = 'Кейс студии кастомных цифровых инструментов: задача, решение и результат.'
    }
    if ($description.Length -gt 160) {
        $description = $description.Substring(0, 159) + '…'
    }

    $htmlTitle = [System.Net.WebUtility]::HtmlEncode("$title — Tools for your work")
    $htmlProjectTitle = [System.Net.WebUtility]::HtmlEncode($title)
    $htmlDescription = [System.Net.WebUtility]::HtmlEncode($description)
    $htmlCaseUrl = [System.Net.WebUtility]::HtmlEncode($caseUrl)
    $ogImage = "${ogBase}?slug=$encodedSlug"
    $htmlOgImage = [System.Net.WebUtility]::HtmlEncode($ogImage)

    $page = $template
    $page = [regex]::Replace($page, '<title>.*?</title>', "<title>$htmlTitle</title>", 'Singleline')
    $page = [regex]::Replace($page, '<meta name="description" content="[^"]*">', '<meta name="description" content="' + $htmlDescription + '">')
    $page = [regex]::Replace($page, '<link rel="canonical" href="[^"]*">', '<link rel="canonical" href="' + $htmlCaseUrl + '">')
    $page = [regex]::Replace($page, '<meta property="og:type" content="[^"]*">', '<meta property="og:type" content="article">')
    $page = [regex]::Replace($page, '<meta property="og:title" content="[^"]*">', '<meta property="og:title" content="' + $htmlProjectTitle + '">')
    $page = [regex]::Replace($page, '<meta property="og:description" content="[^"]*">', '<meta property="og:description" content="' + $htmlDescription + '">')
    $page = [regex]::Replace($page, '<meta property="og:url" content="[^"]*">', '<meta property="og:url" content="' + $htmlCaseUrl + '">')
    $page = [regex]::Replace($page, '<meta property="og:image" content="[^"]*">', '<meta property="og:image" content="' + $htmlOgImage + '">')
    $page = [regex]::Replace($page, '<meta name="twitter:title" content="[^"]*">', '<meta name="twitter:title" content="' + $htmlProjectTitle + '">')
    $page = [regex]::Replace($page, '<meta name="twitter:description" content="[^"]*">', '<meta name="twitter:description" content="' + $htmlDescription + '">')
    $page = [regex]::Replace($page, '<meta name="twitter:image" content="[^"]*">', '<meta name="twitter:image" content="' + $htmlOgImage + '">')

    $slugJson = ConvertTo-Json $slug -Compress
    $urlJson = ConvertTo-Json $caseUrl -Compress
    $bootstrap = '<script>window.PROJECT_SLUG=' + $slugJson + ';window.PROJECT_SHARE_URL=' + $urlJson + ';</script>' + [Environment]::NewLine + '<script src="/custom-tools-studio/project.js"></script>'
    $page = $page.Replace('<script src="/custom-tools-studio/project.js"></script>', $bootstrap)
    $pages.Add(@{ Directory = $caseDir; Html = $page })

    $escapedLoc = [System.Security.SecurityElement]::Escape($caseUrl)
    $lines.Add("  <url><loc>$escapedLoc</loc><lastmod>$lastmod</lastmod><priority>0.8</priority></url>")
}
$lines.Add('</urlset>')

# Recheck the exact deletion target after input validation and before removing it.
Assert-CaseDirectory
if (Test-Path -LiteralPath $caseRoot) {
    Remove-Item -LiteralPath $caseRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $caseRoot -Force | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
foreach ($page in $pages) {
    New-Item -ItemType Directory -Path $page.Directory -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $page.Directory 'index.html'), $page.Html, $utf8)
}
if (Test-Path -LiteralPath $sitemapPath) {
    Assert-RegularFile $sitemapPath
}
[IO.File]::WriteAllLines($sitemapPath, $lines, $utf8)
Write-Host "Generated sitemap.xml and $($pages.Count) case page(s) in $siteRoot."
