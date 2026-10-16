---
'@weils-monitor/core': minor
'@weils-monitor/vue': minor
'@weils-monitor/nuxt': minor
---

Extract framework-independent collectors and the report pipeline into core. Vue and Nuxt now register their framework-specific collectors through the core factory and collector registry. Remove the uniapp package from the workspace.
