import axios from 'axios';

const url = 'https://api.steampowered.com/ISteamDirectory/GetCMList/v1/?format=json&cellid=0';

const getListOfServers = () =>
  new Promise((resolve, reject) => {
    axios.get(url)
    .then(res => {
      const serverlist = res.data.response.serverlist;
      const servers = serverlist.map((server : any) => {
        const parts = server.split(':');

        return {
          host: parts[0],
          port: parts[1],
        }
      });

      resolve(servers);
    })
    .catch(err => reject(err));
  });

  export default getListOfServers;