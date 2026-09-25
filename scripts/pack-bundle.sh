#!/usr/bin/env bash
# Pack a static export into the content-addressed bundle the arcade takes.
#
#   scripts/pack-bundle.sh <export-dir> <bundle.tar.gz>
#
# Writes the archive and, beside it, a `.sha256` sidecar holding the bare digest. The same
# bytes in must give the same bytes out on any machine, because the sha256 IS the bundle's
# identity: it is what the upload receipt echoes, what the operator compares, and what a
# clean-tree rebuild has to reproduce. So every tar header field that could vary is pinned:
#
#   --sort=name                        entry order, never directory order
#   --owner/--group/--numeric-owner    uid/gid 0, no user names
#   --mtime                            one fixed timestamp
#   --mode                             one fixed permission set - 0644 files, 0755
#                                      directories - whatever the checkout's umask, a
#                                      `git archive` or a copy left on the files. `a-x`
#                                      first drops every execute bit, then `u=rwX,go=rX`
#                                      puts x back on directories only: a static export
#                                      has no file that needs to be executable.
#   gzip -n                            no name or timestamp in the gzip header
#
# Python's stdlib tar/gzip writer gives the same deterministic fields on macOS and Linux.
set -euo pipefail
usage='usage: scripts/pack-bundle.sh <export-dir> <bundle.tar.gz>'
src="${1:?$usage}"
out="${2:?$usage}"

mkdir -p "$(dirname "$out")"
python3 - "$src" "$out" <<'PY'
import gzip, hashlib, io, pathlib, sys, tarfile
source, target = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
stamp = 1767225600  # 2026-01-01 00:00:00 UTC
with target.open('wb') as raw:
    with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0, compresslevel=9) as compressed:
        with tarfile.open(mode='w', fileobj=compressed, format=tarfile.USTAR_FORMAT) as archive:
            paths = [source] + sorted(source.rglob('*'), key=lambda p: p.relative_to(source).as_posix())
            for path in paths:
                name = '.' if path == source else './' + path.relative_to(source).as_posix()
                info = tarfile.TarInfo(name)
                info.uid = info.gid = 0
                info.uname = info.gname = ''
                info.mtime = stamp
                info.mode = 0o755 if path.is_dir() else 0o644
                if path.is_dir():
                    info.type = tarfile.DIRTYPE
                    archive.addfile(info)
                elif path.is_file():
                    info.size = path.stat().st_size
                    with path.open('rb') as file:
                        archive.addfile(info, file)
digest = hashlib.sha256(target.read_bytes()).hexdigest()
target.with_name(target.name + '.sha256').write_text(digest + '\n')
PY
