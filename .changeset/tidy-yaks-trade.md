---
'multitars': patch
---

In workerd's `ReadableStream` implementation, prevent concurrent `cancel` call on underlying source during in-flight pulls.
