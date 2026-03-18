// =============================
// COUNTRY DATABASE
// =============================
let COUNTRY = {
    "AF": "Afghanistan",
    "AL": "Albania",
    "DZ": "Algeria",
    "AS": "American Samoa",
    "AD": "Andorra",
    "AO": "Angola",
    "AI": "Anguilla",
    "AQ": "Antarctica",
    "AG": "Antigua and Barbuda",
    "AR": "Argentina",
    "AM": "Armenia",
    "AW": "Aruba",
    "AU": "Australia",
    "AT": "Austria",
    "AZ": "Azerbaijan",
    "BS": "Bahamas",
    "BH": "Bahrain",
    "BD": "Bangladesh",
    "BB": "Barbados",
    "BY": "Belarus",
    "BE": "Belgium",
    "BZ": "Belize",
    "BJ": "Benin",
    "BM": "Bermuda",
    "BT": "Bhutan",
    "BO": "Bolivia",
    "BA": "Bosnia and Herzegovina",
    "BW": "Botswana",
    "BV": "Bouvet Island",
    "BR": "Brazil",
    "IO": "British Indian Ocean Territory",
    "BN": "Brunei Darussalam",
    "BG": "Bulgaria",
    "BF": "Burkina Faso",
    "BI": "Burundi",
    "KH": "Cambodia",
    "CM": "Cameroon",
    "CA": "Canada",
    "CV": "Cape Verde",
    "KY": "Cayman Islands",
    "CF": "Central African Republic",
    "TD": "Chad",
    "CL": "Chile",
    "CN": ["People's Republic of China", "China"],
    "CX": "Christmas Island",
    "CC": "Cocos (Keeling) Islands",
    "CO": "Colombia",
    "KM": "Comoros",
    "CG": ["Republic of the Congo", "Congo"],
    "CD": ["Democratic Republic of the Congo", "Congo"],
    "CK": "Cook Islands",
    "CR": "Costa Rica",
    "CI": ["Cote d'Ivoire", "Côte d'Ivoire", "Ivory Coast"],
    "HR": "Croatia",
    "CU": "Cuba",
    "CY": "Cyprus",
    "CZ": ["Czech Republic", "Czechia"],
    "DK": "Denmark",
    "DJ": "Djibouti",
    "DM": "Dominica",
    "DO": "Dominican Republic",
    "EC": "Ecuador",
    "EG": "Egypt",
    "SV": "El Salvador",
    "GQ": "Equatorial Guinea",
    "ER": "Eritrea",
    "EE": "Estonia",
    "ET": "Ethiopia",
    "FK": "Falkland Islands (Malvinas)",
    "FO": "Faroe Islands",
    "FJ": "Fiji",
    "FI": "Finland",
    "FR": "France",
    "GF": "French Guiana",
    "PF": "French Polynesia",
    "TF": "French Southern Territories",
    "GA": "Gabon",
    "GM": ["Republic of The Gambia", "The Gambia", "Gambia"],
    "GE": "Georgia",
    "DE": "Germany",
    "GH": "Ghana",
    "GI": "Gibraltar",
    "GR": "Greece",
    "GL": "Greenland",
    "GD": "Grenada",
    "GP": "Guadeloupe",
    "GU": "Guam",
    "GT": "Guatemala",
    "GN": "Guinea",
    "GW": "Guinea-Bissau",
    "GY": "Guyana",
    "HT": "Haiti",
    "HM": "Heard Island and McDonald Islands",
    "VA": "Holy See (Vatican City State)",
    "HN": "Honduras",
    "HK": "Hong Kong",
    "HU": "Hungary",
    "IS": "Iceland",
    "IN": "India",
    "ID": "Indonesia",
    "IR": ["Islamic Republic of Iran", "Iran"],
    "IQ": "Iraq",
    "IE": "Ireland",
    "IL": "Israel",
    "IT": "Italy",
    "JM": "Jamaica",
    "JP": "Japan",
    "JO": "Jordan",
    "KZ": "Kazakhstan",
    "KE": "Kenya",
    "KI": "Kiribati",
    "KP": "North Korea",
    "KR": ["South Korea", "Korea, Republic of", "Republic of Korea"],
    "KW": "Kuwait",
    "KG": "Kyrgyzstan",
    "LA": "Lao People's Democratic Republic",
    "LV": "Latvia",
    "LB": "Lebanon",
    "LS": "Lesotho",
    "LR": "Liberia",
    "LY": "Libya",
    "LI": "Liechtenstein",
    "LT": "Lithuania",
    "LU": "Luxembourg",
    "MO": "Macao",
    "MG": "Madagascar",
    "MW": "Malawi",
    "MY": "Malaysia",
    "MV": "Maldives",
    "ML": "Mali",
    "MT": "Malta",
    "MH": "Marshall Islands",
    "MQ": "Martinique",
    "MR": "Mauritania",
    "MU": "Mauritius",
    "YT": "Mayotte",
    "MX": "Mexico",
    "FM": "Micronesia, Federated States of",
    "MD": "Moldova, Republic of",
    "MC": "Monaco",
    "MN": "Mongolia",
    "MS": "Montserrat",
    "MA": "Morocco",
    "MZ": "Mozambique",
    "MM": "Myanmar",
    "NA": "Namibia",
    "NR": "Nauru",
    "NP": "Nepal",
    "NL": ["Netherlands", "The Netherlands", "Netherlands (Kingdom of the)"],
    "NC": "New Caledonia",
    "NZ": "New Zealand",
    "NI": "Nicaragua",
    "NE": "Niger",
    "NG": "Nigeria",
    "NU": "Niue",
    "NF": "Norfolk Island",
    "MK": ["The Republic of North Macedonia", "North Macedonia"],
    "MP": "Northern Mariana Islands",
    "NO": "Norway",
    "OM": "Oman",
    "PK": "Pakistan",
    "PW": "Palau",
    "PS": ["State of Palestine", "Palestine"],
    "PA": "Panama",
    "PG": "Papua New Guinea",
    "PY": "Paraguay",
    "PE": "Peru",
    "PH": "Philippines",
    "PN": ["Pitcairn", "Pitcairn Islands"],
    "PL": "Poland",
    "PT": "Portugal",
    "PR": "Puerto Rico",
    "QA": "Qatar",
    "RE": "Reunion",
    "RO": "Romania",
    "RU": ["Russian Federation", "Russia"],
    "RW": "Rwanda",
    "SH": "Saint Helena",
    "KN": "Saint Kitts and Nevis",
    "LC": "Saint Lucia",
    "PM": "Saint Pierre and Miquelon",
    "VC": "Saint Vincent and the Grenadines",
    "WS": "Samoa",
    "SM": "San Marino",
    "ST": "Sao Tome and Principe",
    "SA": "Saudi Arabia",
    "SN": "Senegal",
    "SC": "Seychelles",
    "SL": "Sierra Leone",
    "SG": "Singapore",
    "SK": "Slovakia",
    "SI": "Slovenia",
    "SB": "Solomon Islands",
    "SO": "Somalia",
    "ZA": "South Africa",
    "GS": "South Georgia and the South Sandwich Islands",
    "ES": "Spain",
    "LK": "Sri Lanka",
    "SD": "Sudan",
    "SR": "Suriname",
    "SJ": "Svalbard and Jan Mayen",
    "SZ": "Eswatini",
    "SE": "Sweden",
    "CH": "Switzerland",
    "SY": "Syrian Arab Republic",
    "TW": ["Taiwan, Province of China", "Taiwan"],
    "TJ": "Tajikistan",
    "TZ": ["United Republic of Tanzania", "Tanzania"],
    "TH": "Thailand",
    "TL": "Timor-Leste",
    "TG": "Togo",
    "TK": "Tokelau",
    "TO": "Tonga",
    "TT": "Trinidad and Tobago",
    "TN": "Tunisia",
    "TR": ["Türkiye","Turkey"],
    "TM": "Turkmenistan",
    "TC": "Turks and Caicos Islands",
    "TV": "Tuvalu",
    "UG": "Uganda",
    "UA": "Ukraine",
    "AE": ["United Arab Emirates", "UAE"],
    "GB": ["United Kingdom", "UK", "Great Britain"],
    "US": ["United States of America", "United States", "USA", "U.S.A.", "US", "U.S."],
    "UM": "United States Minor Outlying Islands",
    "UY": "Uruguay",
    "UZ": "Uzbekistan",
    "VU": "Vanuatu",
    "VE": "Venezuela",
    "VN": "Vietnam",
    "VG": "Virgin Islands, British",
    "VI": "Virgin Islands, U.S.",
    "WF": "Wallis and Futuna",
    "EH": "Western Sahara",
    "YE": "Yemen",
    "ZM": "Zambia",
    "ZW": "Zimbabwe",
    "AX": ["Åland Islands", "Aland Islands"],
    "BQ": "Bonaire, Sint Eustatius and Saba",
    "CW": "Curaçao",
    "GG": "Guernsey",
    "IM": "Isle of Man",
    "JE": "Jersey",
    "ME": "Montenegro",
    "BL": "Saint Barthélemy",
    "MF": "Saint Martin (French part)",
    "RS": "Serbia",
    "SX": "Sint Maarten (Dutch part)",
    "SS": "South Sudan",
    "XK": "Kosovo"
}

// =============================
// LANGUAGE → COUNTRY MAP
// =============================
let LANG_COUNTRY = {

  en: "US",
  ru: "RU",
  es: "ES",
  pt: "PT",
  de: "DE",
  fr: "FR",
  it: "IT",
  tr: "TR",
  ar: "SA",
  fa: "IR",
  id: "ID",
  hi: "IN",
  bn: "BD",
  ur: "PK",
  pa: "PK",
  ne: "NP",
  si: "LK",

  ja: "JP",
  ko: "KR",
  zh: "CN",
  th: "TH",
  vi: "VN",
  ms: "MY",

  uk: "UA",
  uz: "UZ",
  kk: "KZ",
  az: "AZ",
  ka: "GE",

  pl: "PL",
  nl: "NL",
  sv: "SE",
  no: "NO",
  da: "DK",
  fi: "FI",

  cs: "CZ",
  sk: "SK",
  ro: "RO",
  bg: "BG",
  el: "GR",

  he: "IL",
  km: "KH",
  lo: "LA",
  my: "MM"

}


// Normalisation
function normalize(code){
  return String(code).toUpperCase()
}


// =============================
// GET COUNTRY NAME
// =============================
function getName(code){

  if(!code) return "Unknown"

  code = String(code).toUpperCase()

  let country = COUNTRY[code]

  if(!country) return code

  return Array.isArray(country) ? country[0] : country
}


// =============================
// GET COUNTRY FLAG
// =============================
function getFlag(code){

  if(!code) return ""

  code = String(code).toUpperCase()

  if(code.length !== 2) return ""

  return String.fromCodePoint(
    127397 + code.charCodeAt(0),
    127397 + code.charCodeAt(1)
  )
}


// =============================
// GET COUNTRY CODE FROM NAME
// =============================
function getCode(name){

  if(!name) return null

  name = String(name).toLowerCase()

  for(let code in COUNTRY){

    let value = COUNTRY[code]

    let names = Array.isArray(value) ? value : [value]

    for(let n of names){

      if(n.toLowerCase() === name){
        return code
      }

    }

  }

  return null
}


// =============================
// SEARCH COUNTRY
// =============================
function search(text){

  if(!text) return []

  text = String(text).toLowerCase()

  let results = []

  for(let code in COUNTRY){

    let value = COUNTRY[code]

    let names = Array.isArray(value) ? value : [value]

    for(let n of names){

      if(n.toLowerCase().includes(text)){

        results.push({
          code: code,
          name: names[0],
          flag: getFlag(code)
        })

        break
      }

    }

  }

  return results
}


// =============================
// LIST ALL COUNTRIES
// =============================
function list(){

  let text = "🌍 <b>All Countries</b>\n"
  text += "From <b>Libs.country</b>\n\n"

  for(let code in COUNTRY){

    let flag = getFlag(code)
    let value = COUNTRY[code]

    let names = Array.isArray(value) ? value : [value]

    let main = names[0]
    let alt = names.slice(1)

    text += flag + " " + main + " (" + code + ")"

    if(alt.length){
      text += " — " + alt.join(", ")
    }

    text += "\n"

  }

  return text

}

// =============================
// FORMAT COUNTRY
// =============================
function format(code){

  if(!code) return ""

  code = String(code).toUpperCase()

  return getFlag(code) + " " + getName(code) + " (" + code + ")"

}


// =============================
// DETECT COUNTRY FROM USER
// =============================
function fromUser(u){

  if(!u) return null

  if(u.country_code){
    return String(u.country_code).toUpperCase()
  }

  if(u.language_code){

    let lang = String(u.language_code)
      .toLowerCase()
      .split("-")[0]

    if(LANG_COUNTRY[lang]){
      return LANG_COUNTRY[lang]
    }

  }

  return null
}

// =============================
// EXPORT LIBRARY
// =============================
publish({
  getName: getName,
  getFlag: getFlag,
  getCode: getCode,
  search: search,
  list: list,
  format: format,
  fromUser: fromUser
})