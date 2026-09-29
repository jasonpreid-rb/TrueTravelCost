$tag = @'
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WQHJCLN006"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-WQHJCLN006');
</script>
'@

Get-ChildItem .\public -Recurse -Filter index.html | ForEach-Object {
    $file = $_.FullName
    $content = Get-Content $file -Raw

    if ($content -notmatch 'G-WQHJCLN006') {
        $content = $content.Replace('<head>', "<head>`r`n$tag")
        Set-Content $file $content -NoNewline
        Write-Host "Added GA: $file"
    }
    else {
        Write-Host "Already has GA: $file"
    }
}