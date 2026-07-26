import { useNavigate } from "react-router-dom";

export const Templates = () => {
  const navigate = useNavigate();

  return (
    <section className="py-20 px-6 max-w-[1280px] mx-auto">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
          Start with a spark
        </h2>
        <p className="text-text-secondary max-w-2xl mx-auto text-lg">
          Don't know what to build? Pick a starting point and make it yours.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 ">
        {[
          {
            title: "Analytics Dashboard",
            desc: "Data visualization centric layout",
            tag: "SaaS",
            img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDI5s_3pAXgYp7krwIh2JH84BYPwuiWPHY3kA711AavPBC1jjyA9eAtT3yi8T_k7hl69g7g2A8aF6C-y41OiuSMk2M2QimuwuI3R-Z38n2m0EJvTMhOz1bReYlyvuknRcZA49PKMl8dU0bdrQSm-fuaBBjyipRDCT7B6E5Eje1ZVHmrQh90heE0lzFBuCfDDrvWFTjSV07AxhZjK3GFUueFRgAX0d7B5LHhJn6JyMli1N-8uYg-RCIJxTBBKbkCYfkK-FyqiGAUVgU_",
          },
          {
            title: "Minimal Folio",
            desc: "Clean typography for creatives",
            tag: "Portfolio",
            img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDTGjJQW5p0ga2oefxipQOSFp8NFcWTvjxcUKvQTPWojcWUTAMJwvDay2OWFb939G0m8lf_SDvHQmTO6k_302n2Qti5nHsi9HUSrraGBUPisUZBYZomutCIMxfcGa-YLSf7hwz7qpRKE2M6rssFh9ffknqy5lASxy5myrHmb0zK9Gx5iaqwKPOC14tEixO-tUSPqJgoWE__x6ThAFwZ6R-RsF8TUJlY8riNNIuBHDQkGdYQ1mKmFGep7eJV1OZNpJQEF8mvizL9re6C",
          },
          {
            title: "Boutique Shop",
            desc: "Product focused grid layout",
            tag: "Store",
            img: "https://lh3.googleusercontent.com/aida-public/AB6AXuD9yoPgKfd_6PSd9NFPqpEIpUFCL8vvzT8XqFc_XCNJoQs3ECT6-iuqaXDwrNkGcuWnqsERpn7Wr66oJnFy3fDlwTClxPWobn20JJPtkm3DctUzahv3sYxoUR-eUK8DwQKCer3eFGBNPDja9ib_KY7pUBmMEQS3FpCSCCybtZIpyORZYKpugOoa_LDVGV9AtXdXP9Y9QTDFokQDRY1_WZAFY1_qYTSzSlU5vW_xGUhGFVACyCwu4QmLSRt0CnT5PZrfbE6aF24-B7Rv",
          },
          {
            title: "Agency Landing",
            desc: "Conversion optimized sections",
            tag: "Business",
            img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBiege9TbFZfZq7kLT9h1AOXtdgrIQysMdipvMp5iWXQa9MTnrDB44FfEWJKAX0XQF9CWfASaG6g0FXBXz8s6MrUD0VzHh5j-bD1ELaapM1_KtCEz6Yc6EwLh9PmCkVuwZ8_gL4FsFyTlyWH87swwSBpKJzth2GW1FEB3F0_icszuVVPcVYlc5YoYJIN6gRfcr6dmhoKPFL_3Ne7T7bPDU_cRQR5y0UsL0SExKHtsW61_mk21h0tGs0mw6usqUur02kubjy3v2HiJtM",
          },
        ].map((item) => (
          <div
            onClick={() => navigate(`/community`)}
            key={item.title}
            className="group cursor-pointer"
          >
            <div className="aspect-[4/3] rounded-xl overflow-hidden mb-4 relative border border-border-dark">
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors z-10"></div>
              <img
                alt={item.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                src={item.img}
                referrerPolicy="no-referrer"
              />
              <div className="absolute bottom-4 left-4 z-20">
                <span className="bg-primary/90 text-white text-xs font-bold px-2 py-1 rounded">
                  {item.tag}
                </span>
              </div>
            </div>
            <h3 className="text-foreground font-bold text-lg group-hover:text-primary transition-colors">
              {item.title}
            </h3>
            <p className="text-text-secondary text-sm">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
