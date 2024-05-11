export async function onRequestGet(context) {
    try {
        const url = new URL(context.request.url)
        const params = url.searchParams

        if (params.get('run') === 'get') {
            const ps = context.env.MAIN_PAGE_DB.prepare('SELECT comment FROM index_html_comment')
            const data = await ps.all()
            const comments = data.results.map(row => row.comment)
            const response = new Response(JSON.stringify({ status: 'success', comment: comments }))
            response.headers.set('Cache-Control', 'public, max-age=60')
            return response
        } else if (params.get('run') === 'add') {
            const commentText = params.get('comment')
            const ip = context.request.headers.get('CF-Connecting-IP')

            // Check if the comment parameter is missing
            if (!commentText) {
                return new Response(JSON.stringify({ status: 'error', message: 'Comment parameter is missing' }))
            }

            // Check if the comment already exists
            const commentExistsPs = context.env.MAIN_PAGE_DB.prepare('SELECT 1 FROM index_html_comment WHERE comment = ?').bind(commentText)
            // Get all existing indexes
            const indexPs = context.env.MAIN_PAGE_DB.prepare('SELECT `index` FROM index_html_comment')
            // Wait for the results
            const [commentExistsResult, indexResult] = await Promise.all([
                commentExistsPs.run(),
                indexPs.all()
            ])
            // Process the results
            if (commentExistsResult.results.length > 0) {
                return new Response(JSON.stringify({ status: 'error', message: 'Comment already exists' }))
            }
            const existingIndexes = indexResult.results.map(row => row.index)

            // Find the smallest missing index
            let index = Array.from({ length: 51 }, (_, i) => i).find(i => !existingIndexes.includes(i))
            if (!index) {
                index = 0
            }

            // Delete old comment
            if (index === 50) {
                // If the index is 50, delete the row with index 0
                const deletePs = context.env.MAIN_PAGE_DB.prepare('DELETE FROM index_html_comment WHERE `index` = 0')
                await deletePs.run()
            } else {
                // If the index is not 50, check if the row with the next index exists
                const nextIndex = index + 1
                const existsNextPs = context.env.MAIN_PAGE_DB.prepare('SELECT 1 FROM index_html_comment WHERE `index` = ?').bind(nextIndex)
                const existsNextResult = await existsNextPs.run()

                if (existsNextResult.results.length > 0) {
                    // If the row exists, delete it
                    const deleteNextPs = context.env.MAIN_PAGE_DB.prepare('DELETE FROM index_html_comment WHERE `index` = ?').bind(nextIndex)
                    await deleteNextPs.run()
                }
            }

            // Insert the new row
            const insertPs = context.env.MAIN_PAGE_DB.prepare('INSERT INTO index_html_comment (`index`, ip, comment) VALUES (?, ?, ?)').bind(index, ip, commentText)
            await insertPs.run()
            const insertedComment = { index, ip, comment: commentText }
            return new Response(JSON.stringify({ status: 'success', comment: insertedComment }))

        } else {
            return new Response(JSON.stringify({ status: 'error', message: 'Invalid run parameter' }))
        }
    } catch (error) {
        return new Response(JSON.stringify({ status: 'error', message: error.message }))
    }
}
