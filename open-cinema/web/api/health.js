// Vercel mobile-only capability endpoint. Never claim a GPU or a 4K render service here.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({error:'Méthode non autorisée.'});
  return res.status(200).json({app:'Studio Niko Open Cinema',version:'0.4.0',mobile:true,authorized:true,ffmpeg:false,comfy:false,agnesProxy:true,resolution:'export navigateur selon appareil'});
}
