param(
  [int]$Port = 18765
)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class GldnMouse {
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;

  public static void Click(int x, int y) {
    SetCursorPos(x, y);
    System.Threading.Thread.Sleep(80);
    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
    System.Threading.Thread.Sleep(80);
    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
  }
}
"@

$listener = [System.Net.HttpListener]::new()
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "GLDN local click helper listening on $prefix"

function Send-Json($context, [int]$status, [string]$json) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $response = $context.Response
  $response.StatusCode = $status
  $response.ContentType = "application/json"
  $response.Headers["Access-Control-Allow-Origin"] = "*"
  $response.Headers["Access-Control-Allow-Headers"] = "content-type"
  $response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.Close()
}

while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
    $request = $context.Request

    if ($request.HttpMethod -eq "OPTIONS") {
      Send-Json $context 200 '{"ok":true}'
      continue
    }

    if ($request.Url.AbsolutePath -eq "/health") {
      Send-Json $context 200 '{"ok":true,"service":"gldn-local-click-helper"}'
      continue
    }

    if ($request.Url.AbsolutePath -ne "/click" -or $request.HttpMethod -ne "POST") {
      Send-Json $context 404 '{"ok":false,"error":"not found"}'
      continue
    }

    $reader = [System.IO.StreamReader]::new($request.InputStream, $request.ContentEncoding)
    $body = $reader.ReadToEnd()
    $data = $body | ConvertFrom-Json
    $x = [int][Math]::Round([double]$data.x)
    $y = [int][Math]::Round([double]$data.y)

    if ($x -lt 0 -or $y -lt 0) {
      Send-Json $context 400 '{"ok":false,"error":"invalid coordinates"}'
      continue
    }

    [GldnMouse]::Click($x, $y)
    Send-Json $context 200 (@{ ok = $true; x = $x; y = $y } | ConvertTo-Json -Compress)
  } catch {
    try {
      Send-Json $context 500 (@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress)
    } catch {}
  }
}
