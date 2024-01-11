require('dotenv').config()
const axios = require('axios')
const { Client } = require('@notionhq/client')

const notion = new Client({ auth: process.env.NOTION_KEY })
const apiKey = process.env.TMDB_KEY
const todayDate = new Date().toISOString().split('T')[0]
const tmdbArr = []

const fetchData = async () => {
    const response = await axios.get(`https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&air_date.gte=${todayDate}&include_adult=false&include_null_first_air_dates=false&language=en-US&sort_by=popularity.desc&with_genres=18&with_origin_country=KR&with_original_language=ko`)
    const tmdb = response.data.results

    const fetchDataForShows = tmdb.map(async (shows) => {
        try {
            const fetchEpInfo = await axios.get(`https://api.themoviedb.org/3/tv/${shows.id}?api_key=${apiKey}&language=en-US`)
            const showsProvider = await axios.get(`https://api.themoviedb.org/3/tv/${shows.id}/watch/providers?api_key=${apiKey}`)
            const fetchSeasonInfo = await axios.get(`https://api.themoviedb.org/3/tv/${shows.id}/season/${fetchEpInfo.data.number_of_seasons}?api_key=${apiKey}&language=en-US`)
            const seasonInfo = fetchSeasonInfo.data.episodes
            const FetchDataAgain = seasonInfo.map((shows) => {

                const tmdbSeasonInfo = {
                    "id": fetchEpInfo.data.id,
                    "name": fetchEpInfo.data.name,
                    "season": fetchEpInfo.data.number_of_seasons,
                    "next_airEP": `Episode ${shows.episode_number}`,
                    "next_airSeason": fetchEpInfo.data.next_episode_to_air.season_number,
                    "next_airDATE": shows.air_date !== null ? shows.air_date : '1970-01-01',
                    "img": `https://image.tmdb.org/t/p/original${fetchEpInfo.data.poster_path}`,
                }

                console.log(`Fetched ${fetchEpInfo.data.name}.`)
                return tmdbSeasonInfo
            })
            const fetchedShowsData = await Promise.all(FetchDataAgain)
            tmdbArr.push(...fetchedShowsData)

        } catch (error) {
            console.error('Error fetching show data:', error)
            return null
        }
    })

}

const createNotionpage = async () => {
    try {
        const existingPages = await notion.databases.query({
            database_id: process.env.NOTION_DATABASE_ID,
        })

        for (let data of tmdbArr) {

            const duplicateCheck = existingPages.results.find(page =>
                page.properties.Name.title[0]?.text.content === data.name &&
                page.properties.Episode.rich_text[0]?.text.content === data.next_airEP &&
                page.properties.Date.date[0]?.start.content !== data.next_airDATE
            );

            if (duplicateCheck) {
                const existingPageId = duplicateCheck.id;

                const clearResponse = await notion.pages.update({
                    page_id: existingPageId,
                    properties: {},
                });

                const updateResponse = await notion.pages.update({
                    page_id: existingPageId,
                    properties: {
                        "Date": {
                            "date": {
                                "start": data.next_airDATE
                            }
                        }
                    }
                });

                console.log(`Updated ${data.name}, ${data.next_airEP} with a new Date: ${data.next_airDATE}`);
            } else {
                const response = await notion.pages.create({
                    "parent": {
                        "type": "database_id",
                        "database_id": process.env.NOTION_DATABASE_ID
                    },
                    "properties": {
                        "Name": {
                            "title": [
                                {
                                    "type": "text",
                                    "text": {
                                        "content": data.name
                                    }
                                }
                            ]
                        },
                        "Season": {
                            "number": data.next_airSeason
                        },
                        "TMDB ID": {
                            "number": data.id
                        },
                        "Episode": {
                            "rich_text": [
                                {
                                    "type": "text",
                                    "text": {
                                        "content": data.next_airEP
                                    }
                                }
                            ]
                        },
                        "Date": {
                            "date": {
                                "start": data.next_airDATE
                            }
                        },
                        "IMG": {
                            "files": [
                                {
                                    "name": "Poster",
                                    "external": {
                                        "url": data.img
                                    }
                                }
                            ]
                        },
                    }
                })
                console.log(response)
            }
        }
    }
    catch (error) {
        console.error('Error creating Notion page:', error)
    }
}

const fetchDataAndUpdate = async () => {
    try {
        await fetchData()
        await createNotionpage()
    } catch (error) {
        console.error('Error fetching and updating data:', error)
    }
}

fetchDataAndUpdate()


const interval = 3600000
setInterval(fetchDataAndUpdate, interval)