export default defineEventHandler(async (event) => {
  const payload = await readBody(event)
  return await $fetch('http://localhost:8888/api/v1/monitor', {
    method: 'POST',
    body: payload,
  })
})
