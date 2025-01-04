const colors = require("tailwindcss/colors");
const round = (num) =>
  num
    .toFixed(7)
    .replace(/(\.[0-9]+?)0+$/, "$1")
    .replace(/\.0$/, "");
const em = (px, base) => `${round(px / base)}em`;

const plugin = require("tailwindcss/plugin");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        inter: ["Inter"]
      },
      colors: {
        // You can generate your own colors with this tool: https://javisperez.github.io/tailwindcolorshades/
        primary: {
          50: "#fffff5",
          100: "#fcfce8",
          200: "#f8faca",
          300: "#f4f7ab",
          400: "#ecf26d",
          500: "#e0ed34",
          600: "#c2d62b",
          700: "#97b31d",
          800: "#708f13",
          900: "#4d6b0b",
          DEFAULT: "#e0ed34"
        },
        grey: "#0d1117",
        mineshaft: {
          50: "#f5f5f5",
          100: "#ebebeb",
          200: "#ccccce",
          300: "#adaeb0",
          400: "#707174",
          500: "#323439",
          600: "#2d2f33",
          700: "#26272b",
          800: "#1e1f22",
          900: "#19191c",
          DEFAULT: "#323439"
        },
        chicago: {
          50: "#f7f7f7",
          100: "#efefef",
          200: "#d6d6d7",
          300: "#bdbebf",
          400: "#8c8d8e",
          500: "#5b5c5e",
          600: "#525355",
          700: "#444547",
          800: "#373738",
          900: "#2d2d2e",
          DEFAULT: "#5b5c5e"
        },
        bunker: {
          50: "#f3f4f4",
          100: "#e8e8e9",
          200: "#c5c6c8",
          300: "#a2a4a6",
          400: "#5d5f64",
          500: "#171b21",
          600: "#15181e",
          700: "#111419",
          800: "#0e1014",
          900: "#0b0d10",
          DEFAULT: "#171B21"
        },
        githubblack: "#020409",
        blue2: "#130f40",
        blue1: "#3498db",
        yellow: {
          50: "#fefcf3",
          100: "#fef9e7",
          200: "#fcf0c3",
          300: "#f9e79f",
          400: "#f5d657",
          500: "#f1c40f",
          600: "#d9b00e",
          700: "#b5930b",
          800: "#917609",
          900: "#766007",
          DEFAULT: "#f1c40f"
        },
        red: {
          50: "#fef6f5",
          100: "#fdedec",
          200: "#f9d2ce",
          300: "#f5b7b1",
          400: "#ee8277",
          500: "#e74c3c",
          600: "#d04436",
          700: "#ad392d",
          800: "#8b2e24",
          900: "#71251d",
          DEFAULT: "#e74c3c"
        },
        orange: "#f39c12",
        green: {
          50: "#f5fcf8",
          100: "#eafaf1",
          200: "#cbf2dc",
          300: "#abebc6",
          400: "#6ddb9c",
          500: "#2ecc71",
          600: "#29b866",
          700: "#239955",
          800: "#1c7a44",
          900: "#176437",
          DEFAULT: "#2ecc71"
        },
        blue: {
          50: "#f2f8ff",
          100: "#e6f1ff",
          200: "#bfdbff",
          300: "#99c5ff",
          400: "#4d9aff",
          500: "#006eff",
          600: "#0063e6",
          700: "#0053bf",
          800: "#004299",
          900: "#00367d"
        },
        darkblue: {
          50: "#f2f4f7",
          100: "#e6e8f0",
          200: "#bfc6d9",
          300: "#99a3c3",
          400: "#4d5f95",
          500: "#001a68",
          600: "#00175e",
          700: "#00144e",
          800: "#00103e",
          900: "#000d33"
        }
      },
      keyframes: {
        type: {
          "0%": { transform: "translateX(0ch)" },
          "5%, 10%": { transform: "translateX(1ch)" },
          "15%, 20%": { transform: "translateX(2ch)" },
          "25%, 30%": { transform: "translateX(3ch)" },
          "35%, 40%": { transform: "translateX(4ch)" },
          "45%, 50%": { transform: "translateX(5ch)" },
          "55%, 60%": { transform: "translateX(6ch)" },
          "65%, 70%": { transform: "translateX(7ch)" },
          "75%, 80%": { transform: "translateX(8ch)" },
          "85%, 90%": { transform: "translateX(9ch)" },
          "95%, 100%": { transform: "translateX(11ch)" }
        },
        // REQUIRED BY DESIGN COMPONENT
        // MODAL
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 }
        },
        popIn: {
          from: {
            opacity: 0,
            transform: "translate(-50%, -48%) scale(0.96)"
          },
          to: {
            opacity: 1,
            transform: "translate(-50%, -50%) scale(1)"
          }
        },
        // Dropdown
        slideUpAndFade: {
          from: {
            opacity: 0,
            transform: " translateY(2px)"
          },
          to: {
            opacity: 1,
            transform: " translateY(0)"
          }
        },
        slideRightAndFade: {
          from: {
            opacity: 0,
            transform: " translateX(-2px)"
          },
          to: {
            opacity: 1,
            transform: " translateX(0)"
          }
        },
        slideDownAndFade: {
          from: {
            opacity: 0,
            transform: " translateY(-2px)"
          },
          to: {
            opacity: 1,
            transform: " translateY(0)"
          }
        },
        slideLeftAndFade: {
          from: {
            opacity: 0,
            transform: " translateX(2px)"
          },
          to: {
            opacity: 1,
            transform: " translateX(0)"
          }
        },
        // END
        spin: {
          "0%": { transform: "rotate(0deg)" },
          "40%": { transform: "rotate(360deg)" },
          "100%": { transform: "rotate(360deg)" }
        },
        bounce: {
          "0%": { transform: "translateY(-90%)" },
          "100%": { transform: "translateY(-100%)" }
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" }
        },
        ping: {
          "75%, 100%": {
            transform: "scale(2)",
            opacity: 0
          }
        },
        popup: {
          "0%": {
            transform: "scale(0.2)",
            opacity: 0
            // transform: "translateY(120%)",
          },
          "100%": {
            transform: "scale(1)",
            opacity: 1
            // transform: "translateY(100%)",
          }
        },
        popright: {
          "0%": {
            transform: "translateX(-100%)"
          },
          "100%": {
            transform: "translateX(0%)"
          }
        },
        popleft: {
          "0%": {
            transform: "translateX(100%)"
          },
          "100%": {
            transform: "translateX(0%)"
          }
        },
        popdown: {
          "0%": {
            transform: "scale(0.2)",
            opacity: 0
            // transform: "translateY(80%)",
          },
          "100%": {
            transform: "scale(1)",
            opacity: 1
            // transform: "translateY(100%)",
          }
        },
        drawerRightIn: {
          "0%": {
            transform: "translateX(100%)"
          },
          "100%": {
            transform: "translateX(0)"
          }
        },
        drawerRightOut: {
          "0%": {
            transform: "translateX(0)"
          },
          "100%": {
            transform: "translateX(100%)"
          }
        },
        slideDown: {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" }
        },
        slideUp: {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 }
        }
      },
      animation: {
        // Design Lib
        // MODAL
        fadeIn: "fadeIn 100ms cubic-bezier(0.16, 1, 0.3, 1)",
        popIn: "popIn 150ms cubic-bezier(0.16, 1, 0.3, 1);",
        // drawer
        drawerRightIn: "drawerRightIn 150ms ease-in-out",
        drawerRightOut: "drawerRightOut 150ms ease-in-out",
        // Dropdown
        slideDownAndFade: "slideDownAndFade 400ms cubic-bezier(0.16, 1, 0.3, 1)",
        slideLeftAndFade: "slideLeftAndFade 400ms cubic-bezier(0.16, 1, 0.3, 1)",
        slideUpAndFade: "slideUpAndFade 400ms cubic-bezier(0.16, 1, 0.3, 1)",
        slideRightAndFade: "slideRightAndFade 400ms cubic-bezier(0.16, 1, 0.3, 1)",
        slideDown: "slideDown 300ms cubic-bezier(0.87, 0, 0.13, 1)",
        slideUp: "slideUp 300ms cubic-bezier(0.87, 0, 0.13, 1)",
        // END
        // TODO:(akhilmhdh) remove all these unused and keep the config file as small as possible
        // Make the whole color pallelte into simpler
        bounce: "bounce 1000ms ease-in-out infinite",
        spin: "spin 1500ms ease-in-out infinite",
        cursor: "cursor .6s linear infinite alternate",
        type: "type 2.7s ease-out .8s infinite alternate both",
        "type-reverse": "type 1.8s ease-out 0s infinite alternate-reverse both",
        wiggle: "wiggle 200ms ease-in-out",
        ping: "ping 1000ms ease-in-out infinite",
        popup: "popup 300ms ease-in-out",
        popdown: "popdown 300ms ease-in-out",
        popright: "popright 100ms ease-in-out",
        popleft: "popleft 100ms ease-in-out"
      }
    },
    fontSize: {
      xxxs: ".23rem",
      xxs: ".5rem",
      xs: ".75rem",
      sm: ".875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
      "5xl": "3rem",
      "6xl": "4rem",
      "7xl": "5rem",
      "8xl": "6rem",
      "9xl": "7rem"
    },
    typography: (theme) => ({
      DEFAULT: {
        css: [
          {
            color: "var(--tw-prose-body)",
            maxWidth: "65ch",
            '[class~="lead"]': {
              color: "var(--tw-prose-lead)"
            },
            a: {
              color: colors.gray[200],
              textDecoration: "underline",
              fontWeight: "500"
            },
            strong: {
              color: colors.gray[200],
              fontWeight: "600"
            },
            "a strong": {
              color: "inherit"
            },
            "blockquote strong": {
              color: "inherit"
            },
            "thead th strong": {
              color: "inherit"
            },
            ol: {
              listStyleType: "decimal"
            },
            'ol[type="A"]': {
              listStyleType: "upper-alpha"
            },
            'ol[type="a"]': {
              listStyleType: "lower-alpha"
            },
            'ol[type="A" s]': {
              listStyleType: "upper-alpha"
            },
            'ol[type="a" s]': {
              listStyleType: "lower-alpha"
            },
            'ol[type="I"]': {
              listStyleType: "upper-roman"
            },
            'ol[type="i"]': {
              listStyleType: "lower-roman"
            },
            'ol[type="I" s]': {
              listStyleType: "upper-roman"
            },
            'ol[type="i" s]': {
              listStyleType: "lower-roman"
            },
            'ol[type="1"]': {
              listStyleType: "decimal"
            },
            ul: {
              listStyleType: "disc"
            },
            "ol > li::marker": {
              fontWeight: "400",
              color: "var(--tw-prose-counters)"
            },
            "ul > li::marker": {
              color: "var(--tw-prose-bullets)"
            },
            hr: {
              borderColor: "var(--tw-prose-hr)",
              borderTopWidth: 1
            },
            blockquote: {
              fontWeight: "500",
              fontStyle: "italic",
              color: "var(--tw-prose-quotes)",
              borderLeftWidth: "0.25rem",
              borderLeftColor: "var(--tw-prose-quote-borders)",
              quotes: '"\\201C""\\201D""\\2018""\\2019"'
            },
            "blockquote p:first-of-type::before": {
              content: "open-quote"
            },
            "blockquote p:last-of-type::after": {
              content: "close-quote"
            },
            h1: {
              color: colors.gray[200],
              fontWeight: "800"
            },
            "h1 strong": {
              fontWeight: "900",
              color: "inherit"
            },
            h2: {
              color: colors.gray[200],
              fontWeight: "700"
            },
            "h2 strong": {
              fontWeight: "800",
              color: "inherit"
            },
            h3: {
              color: colors.gray[300],
              fontWeight: "600"
            },
            "h3 strong": {
              fontWeight: "700",
              color: "inherit"
            },
            h4: {
              color: colors.gray[400],
              fontWeight: "600"
            },
            "h4 strong": {
              fontWeight: "700",
              color: "inherit"
            },
            // TODO: Figure out how to not need these, it's a merging issue
            img: {},
            "figure > *": {},
            figcaption: {
              color: "var(--tw-prose-captions)"
            },
            code: {
              color: "var(--tw-prose-code)",
              fontWeight: "600"
            },
            "code::before": {
              content: '"`"'
            },
            "code::after": {
              content: '"`"'
            },
            "a code": {
              color: "inherit"
            },
            "h1 code": {
              color: "inherit"
            },
            "h2 code": {
              color: "inherit"
            },
            "h3 code": {
              color: "inherit"
            },
            "h4 code": {
              color: "inherit"
            },
            "blockquote code": {
              color: "inherit"
            },
            "thead th code": {
              color: "inherit"
            },
            pre: {
              color: "var(--tw-prose-pre-code)",
              backgroundColor: colors.gray[800],
              overflowX: "auto",
              fontWeight: "400"
            },
            "pre code": {
              backgroundColor: "transparent",
              borderWidth: "0",
              borderRadius: "0",
              padding: "0",
              fontWeight: "inherit",
              color: "inherit",
              fontSize: "inherit",
              fontFamily: "inherit",
              lineHeight: "inherit"
            },
            "pre code::before": {
              content: "none"
            },
            "pre code::after": {
              content: "none"
            },
            table: {
              width: "100%",
              tableLayout: "auto",
              textAlign: "left",
              marginTop: em(32, 16),
              marginBottom: em(32, 16)
            },
            thead: {
              borderBottomWidth: "1px",
              borderBottomColor: "var(--tw-prose-th-borders)"
            },
            "thead th": {
              color: "var(--tw-prose-headings)",
              fontWeight: "600",
              verticalAlign: "bottom"
            },
            "tbody tr": {
              borderBottomWidth: "1px",
              borderBottomColor: "var(--tw-prose-td-borders)"
            },
            "tbody tr:last-child": {
              borderBottomWidth: "0"
            },
            "tbody td": {
              verticalAlign: "baseline"
            },
            tfoot: {
              borderTopWidth: "1px",
              borderTopColor: "var(--tw-prose-th-borders)"
            },
            "tfoot td": {
              verticalAlign: "top"
            }
          }
        ]
      }
    })
  },
  plugins: [
    plugin(function ({ addUtilities }) {
      addUtilities({
        ".no-scrollbar::-webkit-scrollbar": {
          display: "none"
        },
        ".no-scrollbar": {
          "-ms-overflow-style": "none",
          "scrollbar-width": "none"
        }
      });
    }),
    require("@tailwindcss/typography")
  ]
};
