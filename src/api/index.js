import { Request } from "@aomao/engine";

const request = new Request();

export const get = () => {
  return request.ajax({
    url: `/api/doc/get`,
  });
};

export const update = (payload) => {
  return request.ajax({
    url: `https://editor.aomao.com/api/doc/content`,
    method: "POST",
    data: {
      content: payload,
    },
  });
};
