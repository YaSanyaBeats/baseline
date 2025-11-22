const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const formattedDate = date.toLocaleDateString('ru-RU').replace(/\./g, '.');
    return formattedDate;
}

const formatTitle = (firstName: string, lastName: string, title: string) => {
    if(title) {
        title = `(${title})`;
    }


    return [firstName, lastName, title].join(' ');
}

export {formatDate, formatTitle}