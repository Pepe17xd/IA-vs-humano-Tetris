"""Best-effort Windows desktop visibility checks for the calibrated region."""
import ctypes
import sys
import ntpath
from ctypes import wintypes


def intersects(a, b):
    """Intersect rectangles expressed as (left, top, right, bottom)."""
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def check_visibility(region, debug_title=None):
    """Return (visible, reason). Sample Windows hit-test points; never a proof of visibility."""
    if sys.platform != 'win32':
        return False, 'Windows visibility check unavailable'
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    user32.WindowFromPoint.argtypes = [wintypes.POINT]
    user32.WindowFromPoint.restype = wintypes.HWND
    user32.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
    user32.GetAncestor.restype = wintypes.HWND
    user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetClassNameW.restype = ctypes.c_int
    user32.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
    user32.FindWindowW.restype = wintypes.HWND
    user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    user32.GetWindowRect.restype = wintypes.BOOL
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    kernel32.QueryFullProcessImageNameW.restype = wintypes.BOOL
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    rect = (region.left, region.top, region.left + region.width, region.top + region.height)
    if debug_title:
        hwnd = user32.FindWindowW(None, debug_title)
        if hwnd:
            bounds = wintypes.RECT()
            if not user32.GetWindowRect(hwnd, ctypes.byref(bounds)):
                return False, 'Cannot determine debug window position'
            if intersects(rect, (bounds.left, bounds.top, bounds.right, bounds.bottom)):
                return False, 'Debug window overlaps calibrated region; move it away'
    # Require every sampled point to resolve to the same Chrome top-level window.
    # Grid includes the boundaries and cell centers; transparent windows, small
    # occluders between samples and Windows DPI behavior can still defeat it.
    owner = None
    for iy in range(41):
        y = region.top + (region.height - 1) * iy // 40
        for ix in range(21):
            x = region.left + (region.width - 1) * ix // 20
            handle = user32.WindowFromPoint(wintypes.POINT(x, y))
            root = user32.GetAncestor(handle, 2) if handle else None
            if not root:
                return False, 'Could not identify the window covering the board'
            if owner is None:
                owner = root
                name = ctypes.create_unicode_buffer(256)
                if not user32.GetClassNameW(owner, name, len(name)) or name.value != 'Chrome_WidgetWin_1':
                    return False, 'Calibrated region is not covered by a Chrome window'
                pid = wintypes.DWORD()
                user32.GetWindowThreadProcessId(owner, ctypes.byref(pid))
                process = kernel32.OpenProcess(0x1000, False, pid.value)
                if not process:
                    return False, 'Cannot verify the window process'
                try:
                    path = ctypes.create_unicode_buffer(32768)
                    length = wintypes.DWORD(len(path))
                    if not kernel32.QueryFullProcessImageNameW(process, 0, path, ctypes.byref(length)):
                        return False, 'Cannot verify the window process'
                    if ntpath.basename(path.value).lower() != 'chrome.exe':
                        return False, 'Calibrated region is not covered by Chrome'
                finally:
                    kernel32.CloseHandle(process)
            elif root != owner:
                return False, 'Calibrated region is covered by another window'
    return True, ''
