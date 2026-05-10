#!/usr/bin/env python3
"""No-cache HTTP server for development"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Prevent all caching
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        sys.stderr.write(f"{self.log_date_time_string()} {format % args}\n")
        sys.stderr.flush()

if __name__ == '__main__':
    port = 3000
    server = HTTPServer(('0.0.0.0', port), NoCacheHandler)
    print(f"No-cache server running on port {port}", flush=True)
    server.serve_forever()
