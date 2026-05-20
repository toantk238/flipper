set shell := ["bash", "-uc"]

dist := justfile_directory() + "/dist"
server_dir := dist / "server"
archive := dist / "flipper-server.tgz"

# List available recipes
default:
    @just --list

desktop-deps:
    cd desktop && yarn install

desktop-run:
    cd desktop && yarn start

# Build the server source (produces dist/flipper-server.tgz)
build-server:
    cd desktop && yarn build:flipper-server

# Extract dist/flipper-server.tgz into dist/server
extract-server:
    test -f {{ archive }} || (echo "Missing {{ archive }} — run 'just build-server' first" >&2; exit 1)
    rm -rf {{ server_dir }}
    mkdir -p {{ server_dir }}
    tar -xzf {{ archive }} -C {{ server_dir }} --strip-components=1

# Install server package dependencies
install-server-deps:
    cd {{ server_dir }}/package && npm i

# Build the server and extract it into dist/server
build: build-server extract-server install-server-deps
