#!/usr/bin/env bash
# Run the Watch Doctor test suite: backend tests, then the frontend type check.
#
# Usage: ./run_tests.sh [site] [--build]
#   site     test site to run against (default: test-dwy)
#   --build  also run the production build (this replaces the live /repair files)
#
# Never point this at the live site: the Frappe test runner commits _Test
# records and ERPNext's before_tests hook changes defaults and roles.
# Make a throwaway copy once:
#   bench --site site2-dwy backup
#   bench new-site test-dwy
#   bench --site test-dwy restore sites/site2-dwy/private/backups/<newest>-database.sql.gz
#   bench --site test-dwy migrate
#   bench --site test-dwy set-config allow_tests true
#   bench --site test-dwy set-config mute_emails 1
#   bench --site test-dwy scheduler disable
set -uo pipefail

SITE=test-dwy
BUILD=0
for arg in "$@"; do
	case "$arg" in
		--build) BUILD=1 ;;
		-h|--help) sed -n 2,17p "$0"; exit 0 ;;
		*) SITE="$arg" ;;
	esac
done

APP_DIR=$(cd "$(dirname "$0")" && pwd)
BENCH_DIR=$(cd "$APP_DIR/../.." && pwd)
LIVE_SITES="site2-dwy"

if [[ " $LIVE_SITES " == *" $SITE "* ]]; then
	echo "Refusing to run tests on the live site $SITE. Use a test copy (see ./run_tests.sh --help)." >&2
	exit 2
fi
if [ ! -d "$BENCH_DIR/sites/$SITE" ]; then
	echo "No site called $SITE. Create a test copy first (see ./run_tests.sh --help)." >&2
	exit 2
fi

failed=()

echo "== Backend tests on $SITE"
(cd "$BENCH_DIR" && bench --site "$SITE" run-tests --app watch_doctor) || failed+=("backend tests")

echo "== Frontend type check"
(cd "$APP_DIR/frontend" && npx tsc --noEmit -p .) || failed+=("frontend type check")

if [ "$BUILD" = 1 ]; then
	echo "== Frontend build"
	(cd "$APP_DIR/frontend" && npm run build) || failed+=("frontend build")
fi

if [ ${#failed[@]} -gt 0 ]; then
	printf 'FAILED: %s\n' "${failed[@]}" >&2
	exit 1
fi
echo "All checks passed."
