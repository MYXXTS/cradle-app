# New Work feature

`NewWorkPage` is the outcome-oriented local coding entry point. It reuses the
existing composer/runtime selection controls, requires a local Workspace, calls
`POST /works` once, and starts the first Agent response only after Work creation
succeeds.

Source-dirty and creation failures stay in context. Starting Work authorizes
local isolated execution only and never grants automatic GitHub delivery.
