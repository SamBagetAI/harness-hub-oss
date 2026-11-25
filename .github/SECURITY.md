# Security

Harness Hub decides who sees which harness and which agent may write, so a hole in it matters even
though it never holds anyone's passwords.

## Reporting a problem

Please do not open a public issue. Use GitHub's private reporting instead: on this repository,
Security, then "Report a vulnerability". Say what you found, how to reproduce it, and what someone
could do with it.

You will get an answer within a week. Once it is fixed, you are credited in the fix unless you ask
not to be.

## What counts

For example: seeing or changing an item you should not see, an agent writing when its person made
it read-only, text from a teammate passing for the Hub's own words or the harness owner's, getting
in without being on the allowed list, or a way to make the Hub store a secret.

## Running your own Hub

Each Hub is run by whoever deployed it. Keep your dependencies up to date, keep `ALLOWED_EMAILS`
short, and ban a person in Clerk to cut them off at once.
