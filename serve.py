# -*- coding: utf-8 -*-
"""Дев-сервер: как python -m http.server, но с Cache-Control: no-cache —
браузер (в т.ч. Safari на телефоне) всегда ревалидирует файлы и не
играет со старым JS из HTTP-кэша."""
import http.server
import os

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    print('serving', APP, 'on http://0.0.0.0:8080')
    http.server.ThreadingHTTPServer(('', 8080), Handler).serve_forever()
