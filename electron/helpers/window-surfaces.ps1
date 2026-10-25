$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class ArkpediaWindowSurfaces {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  public delegate bool Callback(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int key, out int value, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int key, out Rect value, int size);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder name, int count);
  public static object[] Read(uint excluded) {
    SetProcessDPIAware();
    var rows=new List<object>();
    EnumWindows((h,p)=>{
      uint pid; GetWindowThreadProcessId(h,out pid);
      int cloaked=0; DwmGetWindowAttribute(h,14,out cloaked,4);
      var name=new StringBuilder(256); GetClassName(h,name,256);
      if(pid==excluded || !IsWindowVisible(h) || IsIconic(h) || cloaked!=0 || GetWindowTextLength(h)==0 || name.ToString()=="Progman" || name.ToString()=="WorkerW")return true;
      Rect r; if(DwmGetWindowAttribute(h,9,out r,Marshal.SizeOf(typeof(Rect)))!=0 && !GetWindowRect(h,out r))return true;
      if(r.Right-r.Left>80 && r.Bottom-r.Top>40) rows.Add(new {x=r.Left,y=r.Top,width=r.Right-r.Left,height=r.Bottom-r.Top});
      return rows.Count<256;
    },IntPtr.Zero);
    return rows.ToArray();
  }
}
'@
while ($true) {
  $rects = [ArkpediaWindowSurfaces]::Read([uint32]$args[0])
  ConvertTo-Json -InputObject @($rects) -Compress
  Start-Sleep -Milliseconds 750
}
