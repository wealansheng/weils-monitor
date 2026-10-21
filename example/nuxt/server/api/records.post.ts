export default defineEventHandler(async event => {
  const body = await readRawBody(event)
  return await $fetch('http://localhost:8888/api/v1/records', {
    method: 'POST', body, headers: { 'content-type': 'application/json' },
  })
})
