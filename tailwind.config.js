module.exports = {
  content: ['./src/**/*.jsx'],
  theme: {
    extend: {
      // Màu nhận diện thương hiệu Thống Nhất (theo "Tài liệu Quy chuẩn & Hướng
      // dẫn Sử dụng Logo Thống Nhất") — xanh dương là màu chủ đạo (thay cho màu
      // cam dùng tạm trước đây), đỏ dùng làm màu nhấn (logo, khẩu hiệu).
      colors: {
        brand: {
          300: '#80c7ff',
          400: '#3daaff',
          500: '#0081e6',
          600: '#005495', // C100 M75 Y15 K0 — màu xanh chính thức
          700: '#00457a',
          800: '#00345c',
          900: '#00233d',
        },
        brandred: {
          DEFAULT: '#be3736', // C10 M90 Y80 K15 — màu đỏ chính thức
          600: '#be3736',
          700: '#9c2c2b',
        },
      },
    },
  },
  plugins: [],
};
