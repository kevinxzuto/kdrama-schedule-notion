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
            const epInfo = await axios.get(`https://api.themoviedb.org/3/tv/${shows.id}?api_key=${apiKey}&language=en-US`)

            const tmdbSeasonInfo = {
                "name": epInfo.data.name,
                "season": epInfo.data.number_of_seasons,
                "next_airEP": epInfo.data.next_episode_to_air.name,
                "next_airSeason": epInfo.data.next_episode_to_air.season_number,
                "next_airDATE": epInfo.data.next_episode_to_air.air_date,
                "img": `https://image.tmdb.org/t/p/original${epInfo.data.poster_path}`
            }

            console.log(`Fetched ${epInfo.data.name}.`)
            return tmdbSeasonInfo
        } catch (error) {
            console.error('Error fetching show data:', error)
            return null
        }
    })

    const fetchedShowsData = await Promise.all(fetchDataForShows)
    const filteredData = fetchedShowsData.filter(show => show !== null)
    tmdbArr.push(...filteredData)
}

const createNotionpage = async () => {

    try {
        const existingPages = await notion.databases.query({
            database_id: process.env.NOTION_DATABASE_ID,
        })

        for (let data of tmdbArr) {

            const matchingEntry = existingPages.results.find((page) => {
                return (
                    page.properties.Season.number === data.next_airSeason &&
                    page.properties.Episode.rich_text[0].text.content === data.next_airEP &&
                    page.properties.Date.date.start === data.next_airDATE // Check for different date
                )
            })

            if (!matchingEntry) {
                const existingEntryWithSameDetails = existingPages.results.find((page) => {
                    return (
                        page.properties.Season.number === data.next_airSeason &&
                        page.properties.Episode.rich_text[0].text.content === data.next_airEP &&
                        page.properties.Date.date.start !== data.next_airDATE
                    )
                })

                if (existingEntryWithSameDetails) {
                    console.log(`Entry for ${data.name} Season ${data.next_airSeason} Episode "${data.next_airEP}" with a different date already exists. Updating date...`)

                    const response = await notion.pages.update({
                        page_id: existingEntryWithSameDetails.id,
                        properties: {
                            Date: {
                                date: {
                                    start: data.next_airDATE,
                                },
                            },
                        },
                    })
                    console.log(response)
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
            } else {
                console.log(
                    `Entry for ${data.name} Season ${data.next_airSeason} Episode "${data.next_airEP}" already exists.`
                )
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


const interval = 43200000
setInterval(fetchDataAndUpdate, interval)